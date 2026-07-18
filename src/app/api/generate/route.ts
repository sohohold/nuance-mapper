import { NextResponse } from "next/server";
import { jsonrepair } from "jsonrepair";
import OpenAI from "openai";
import { cacheGet, cacheSet } from "@/lib/cache";
import {
  GENERATION_CONFIG,
  MODEL_PROVIDERS,
  type ModelProviderConfig,
} from "@/lib/config";
import { rateLimit } from "@/lib/rate-limit";

interface NuanceItem {
  word: string;
  x: number;
  y: number;
  nuance: string;
}

class AllModelsFailedError extends Error {
  constructor(
    message: string,
    public readonly allRateLimited: boolean,
  ) {
    super(message);
    this.name = "AllModelsFailedError";
  }
}

class CandidateAttemptsFailedError extends Error {
  constructor(
    message: string,
    public readonly bestEffort: NuanceItem[],
    public readonly allRateLimited: boolean,
  ) {
    super(message);
    this.name = "CandidateAttemptsFailedError";
  }
}

interface ModelCandidate extends ModelProviderConfig {
  apiKey: string;
}

function candidateLabel(c: ModelCandidate): string {
  return `${c.provider}:${c.models[0]}`;
}

function buildCandidates(): ModelCandidate[] {
  const out: ModelCandidate[] = [];
  for (const provider of MODEL_PROVIDERS) {
    const apiKey = process.env[provider.apiKeyEnv];
    if (apiKey) out.push({ ...provider, apiKey });
  }
  return out;
}

// ── Dynamic model resolution ─────────────────────────────────────────
// Free-tier providers deprecate and rename their fast models often, so
// instead of pinning one id, ask the provider which of our preferred
// models it currently serves and take the first (fastest) match.
const resolvedModels = new Map<string, { model: string; expiresAt: number }>();

const OPENROUTER_NUANCE_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "submit_nuances",
    description: "Submit the generated nuance-map entries.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              word: { type: "string" },
              x: { type: "number" },
              y: { type: "number" },
              nuance: { type: "string" },
            },
            required: ["word", "x", "y", "nuance"],
            additionalProperties: false,
          },
        },
      },
      required: ["items"],
      additionalProperties: false,
    },
  },
};

async function resolveModel(c: ModelCandidate): Promise<string> {
  if (c.models.length === 1) return c.models[0];
  const cached = resolvedModels.get(c.provider);
  if (cached && Date.now() < cached.expiresAt) return cached.model;
  // If the refresh fails or matches nothing, a stale last-known-good
  // resolution beats blindly retrying the head of the list, which may be
  // exactly the model whose absence demoted us in the first place
  let model = cached?.model ?? c.models[0];
  let ttl = GENERATION_CONFIG.modelResolve.retryTtlMs;
  try {
    const res = await fetch(`${c.baseURL.replace(/\/+$/, "")}/models`, {
      headers: { Authorization: `Bearer ${c.apiKey}` },
      signal: AbortSignal.timeout(GENERATION_CONFIG.modelResolve.timeoutMs),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { data?: { id?: string }[] };
    // Gemini's OpenAI-compat layer prefixes ids with "models/"
    const available = new Set(
      (data.data ?? []).map((m) => String(m.id ?? "").replace(/^models\//, "")),
    );
    const found = c.models.find((m) => available.has(m));
    if (found) {
      model = found;
      ttl = GENERATION_CONFIG.modelResolve.successTtlMs;
    } else {
      console.warn(
        `${c.provider}: none of the preferred models are listed — trying ${model}`,
      );
    }
  } catch (err) {
    console.warn(
      `${c.provider}: model resolution failed (${err}) — trying ${model}`,
    );
  }
  resolvedModels.set(c.provider, { model, expiresAt: Date.now() + ttl });
  return model;
}

// ── SSE helpers ──────────────────────────────────────────────────────
function createSSEStream(
  items: NuanceItem[],
  stagger: boolean,
  meta?: { fromCache?: boolean; degraded?: boolean },
): Response {
  const encoder = new TextEncoder();
  let index = 0;
  let metaSent = false;

  const stream = new ReadableStream({
    async pull(controller) {
      // Send metadata event first (cache source info)
      if (!metaSent) {
        metaSent = true;
        if (meta) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ __meta: true, ...meta })}\n\n`,
            ),
          );
        }
      }

      if (index < items.length) {
        // Small stagger between items for visual streaming effect
        if (stagger && index > 0) {
          await new Promise((r) =>
            setTimeout(r, GENERATION_CONFIG.streamItemDelayMs),
          );
        }
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(items[index])}\n\n`),
        );
        index++;
      } else {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

// ── Normalize model response to array ────────────────────────────────
function normalizeItems(data: unknown): NuanceItem[] {
  if (Array.isArray(data)) return data;
  if (typeof data === "object" && data !== null) {
    const obj = data as Record<string, unknown>;
    for (const key of ["results", "words", "synonyms"]) {
      if (Array.isArray(obj[key])) return obj[key] as NuanceItem[];
    }
    const arr = Object.values(obj).find((v) => Array.isArray(v));
    if (arr) return arr as NuanceItem[];
  }
  throw new Error("Could not parse response as items array");
}

// ── Strip markdown code fences ───────────────────────────────────────
function stripCodeFences(str: string): string {
  let s = str.trim();
  if (s.startsWith("```json")) {
    s = s.replace(/^```json\n?/, "").replace(/\n?```$/, "");
  } else if (s.startsWith("```")) {
    s = s.replace(/^```\n?/, "").replace(/\n?```$/, "");
  }
  return s;
}

// ── Parse model output (tolerates <think> blocks and stray prose) ────
function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return JSON.parse(jsonrepair(value));
  }
}

function parseModelContent(content: string): NuanceItem[] {
  const s = stripCodeFences(
    content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim(),
  );
  try {
    return normalizeItems(parseJson(s));
  } catch {
    const start = s.indexOf("[");
    const end = s.lastIndexOf("]");
    if (start === -1 || end <= start) throw new Error("No JSON array found");
    return normalizeItems(parseJson(s.slice(start, end + 1)));
  }
}

// ── Sanitize: drop malformed entries, dedupe, clamp coordinates ──────
function sanitizeItems(items: NuanceItem[], axisMax: number): NuanceItem[] {
  const seen = new Set<string>();
  const out: NuanceItem[] = [];
  for (const item of items) {
    if (out.length >= GENERATION_CONFIG.output.maxItems) break;
    if (typeof item?.word !== "string" || !item.word.trim()) continue;
    const x = Number(item.x);
    const y = Number(item.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const word = item.word.trim();
    if (
      word.length > GENERATION_CONFIG.output.maxWordLength ||
      seen.has(word)
    ) {
      continue;
    }
    seen.add(word);
    out.push({
      word,
      x: Math.max(-axisMax, Math.min(axisMax, x)),
      y: Math.max(-axisMax, Math.min(axisMax, y)),
      nuance:
        typeof item.nuance === "string"
          ? item.nuance.slice(0, GENERATION_CONFIG.output.maxNuanceLength)
          : "",
    });
  }
  return out;
}

function qualityIssue(items: NuanceItem[]): string | null {
  if (items.length < GENERATION_CONFIG.quality.minItems) {
    return `only ${items.length} valid items`;
  }
  const quadrants = new Set(
    items.map((i) => `${i.x >= 0 ? "R" : "L"}${i.y >= 0 ? "T" : "B"}`),
  );
  if (quadrants.size < GENERATION_CONFIG.quality.minQuadrants) {
    return `items cover only ${quadrants.size} quadrants`;
  }
  return null;
}

export async function POST(req: Request) {
  // Hoisted so the catch block can fall back to the cache on upstream 429s
  let cacheKey: string | null = null;
  try {
    // ── Rate limit per client IP ─────────────────────────────────
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const rl = rateLimit(ip);
    if (!rl.success) {
      return NextResponse.json(
        { error: "Too many requests", retryAfter: rl.retryAfter },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
      );
    }

    // ── Input validation ─────────────────────────────────────────
    // Everything here is interpolated into the prompt, so reject
    // non-strings and oversized payloads outright
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const { word, xAxis, yAxis, skipCache } = (body ?? {}) as Record<
      string,
      unknown
    >;
    if (
      typeof word !== "string" ||
      !word.trim() ||
      word.length > GENERATION_CONFIG.input.maxWordLength
    ) {
      return NextResponse.json({ error: "Word is required" }, { status: 400 });
    }
    const isValidAxis = (v: unknown): v is string =>
      typeof v === "string" &&
      v.trim().length > 0 &&
      v.length <= GENERATION_CONFIG.input.maxAxisLabelLength;
    if (!isValidAxis(xAxis) || !isValidAxis(yAxis)) {
      return NextResponse.json(
        { error: "Axis labels are required" },
        { status: 400 },
      );
    }

    // ── Cache check ────────────────────────────────────────────────
    // Normalized key (NFKC/trim) so trivial input variants hit. Case is
    // preserved: the prompt sees the original spelling, and "Apple" and
    // "apple" are different generations
    cacheKey = [word, xAxis, yAxis]
      .map((s) => s.normalize("NFKC").trim())
      .join("|");
    if (!skipCache) {
      const cached = await cacheGet<NuanceItem>(cacheKey);
      if (cached) {
        console.log(`Cache hit: ${cacheKey}`);
        return createSSEStream(cached, false, { fromCache: true });
      }
    } else {
      console.log(`Cache skip requested: ${cacheKey}`);
    }

    const candidates = buildCandidates();
    if (candidates.length === 0) {
      console.warn("No provider API key is set. Returning mock data.");
      return createSSEStream(
        [
          {
            word: "MockData 1",
            x: GENERATION_CONFIG.mockCoordinateOffset,
            y: GENERATION_CONFIG.mockCoordinateOffset,
            nuance: "APIキー未設定時のモックデータ",
          },
          {
            word: "MockData 2",
            x: -GENERATION_CONFIG.mockCoordinateOffset,
            y: -GENERATION_CONFIG.mockCoordinateOffset,
            nuance: "環境変数を設定してください",
          },
          { word: word, x: 0, y: 0, nuance: "入力された単語" },
        ],
        false,
      );
    }

    // One client per provider baseURL, created on first use
    const clients = new Map<string, OpenAI>();
    const clientFor = (c: ModelCandidate): OpenAI => {
      let client = clients.get(c.baseURL);
      if (!client) {
        client = new OpenAI({
          baseURL: c.baseURL,
          apiKey: c.apiKey,
          // Failover is handled by the hedged race — the SDK's default retries
          // (2 per request) would multiply free-tier usage and stall the ladder
          maxRetries: GENERATION_CONFIG.requests.sdkMaxRetries,
        });
        clients.set(c.baseURL, client);
      }
      return client;
    };

    const axisMax = GENERATION_CONFIG.prompt.axisMax;

    const prompt = `
      # Role
      あなたは高度な日本語の語彙力を持つ「ニュアンス・マッパー」です。

      # Task
      入力語「${word}」の類語・言い換え表現を、2次元の座標空間上に**なるべく広く分散させて**配置してください。
      **重要: まず座標空間の各領域を意識し、その領域にふさわしい表現を探す、という順序で考えてください。**

      # Axes Definition (座標軸の定義)
      ## X軸: ${xAxis}
      -${axisMax}: ${xAxis}が最も低い/反対の性質 ← 0: 中立 → +${axisMax}: ${xAxis}が最も高い/強い性質

      ## Y軸: ${yAxis}
      -${axisMax}: ${yAxis}が最も低い/反対の性質 ← 0: 中立 → +${axisMax}: ${yAxis}が最も高い/強い性質

      # Zone-Based Generation Strategy（ゾーン分散戦略）
      座標平面を以下の9ゾーンに分け、**各ゾーンに最低1つ、合計${GENERATION_CONFIG.prompt.targetItems}個**の単語を配置してください。
      ゾーン名は出力に含めないでください。

      1. 右上 (x>0, y>0): ${xAxis}が高く、${yAxis}も高い表現
      2. 右下 (x>0, y<0): ${xAxis}が高いが、${yAxis}は低い表現
      3. 左上 (x<0, y>0): ${xAxis}が低いが、${yAxis}は高い表現
      4. 左下 (x<0, y<0): ${xAxis}も${yAxis}も低い表現
      5. 右端 (x≈+${axisMax}): ${xAxis}が極端に高い表現
      6. 左端 (x≈-${axisMax}): ${xAxis}が極端に低い表現
      7. 上端 (y≈+${axisMax}): ${yAxis}が極端に高い表現
      8. 下端 (y≈-${axisMax}): ${yAxis}が極端に低い表現
      9. 中央 (x≈0, y≈0): 中立的な表現

      # Output Format (出力形式)
      結果は必ず **JSON配列のみ** で出力してください。Markdownのコードブロックは不要です。
      JSON以外の説明文や挨拶は一切含めないでください。
      [
        {
          "word": "単語",
          "x": 数値(-${axisMax}〜${axisMax}),
          "y": 数値(-${axisMax}〜${axisMax}),
          "nuance": "その言葉が持つ微細なニュアンスの短い解説（20文字以内）"
        },
        ...
      ]

      # Constraints
      1. **座標空間全体をカバーすること。** 4象限すべてに単語が存在し、|x|≥${GENERATION_CONFIG.prompt.edgeThreshold} や |y|≥${GENERATION_CONFIG.prompt.edgeThreshold} の端にも配置すること。
      2. 入力語「${word}」と意味的に関連がある語を選ぶこと。ただし、軸の端をカバーするためにやや広い関連語も許容する。
      3. 入力語「${word}」の品詞に合わせて適切な類語を選ぶこと。
      4. 同じような座標に複数の単語が集中しないこと。
    `;

    // ── Helper: call a single model, returns sanitized items ─────────
    async function callModel(
      candidate: ModelCandidate,
      model: string,
      signal: AbortSignal,
    ): Promise<NuanceItem[]> {
      const label = `${candidate.provider}:${model}`;
      const toolOutput = candidate.toolOutput;
      const result = await clientFor(candidate).chat.completions.create(
        {
          model,
          messages: [
            {
              role: "system",
              content:
                "You are a helpful assistant that outputs strictly JSON.",
            },
            {
              role: "user",
              content: toolOutput
                ? `${prompt}\nSubmit the entries with the submit_nuances tool.`
                : prompt,
            },
          ],
          ...(toolOutput && {
            tools: [OPENROUTER_NUANCE_TOOL],
            tool_choice: {
              type: "function" as const,
              function: { name: "submit_nuances" },
            },
            reasoning_effort: toolOutput.reasoningEffort,
            max_completion_tokens: toolOutput.maxCompletionTokens,
          }),
        },
        { signal },
      );
      const message = result.choices[0]?.message;
      const toolCall = message?.tool_calls?.find(
        (call) =>
          call.type === "function" && call.function.name === "submit_nuances",
      );
      const content =
        toolCall?.type === "function"
          ? toolCall.function.arguments
          : message?.content;
      if (!content) throw new Error(`${label}: empty content`);
      return sanitizeItems(parseModelContent(content), axisMax);
    }

    async function callCandidate(
      candidate: ModelCandidate,
      signal: AbortSignal,
    ): Promise<NuanceItem[]> {
      const primaryModel = await resolveModel(candidate);
      const primaryIndex = Math.max(candidate.models.indexOf(primaryModel), 0);
      const models = candidate.sequentialModelFallback
        ? candidate.models.slice(primaryIndex)
        : [primaryModel];
      const errors: string[] = [];
      let bestEffort: NuanceItem[] = [];
      let allRateLimited = true;

      if (primaryModel !== candidate.models[0]) {
        console.log(
          `Resolved model for ${candidate.provider}: ${primaryModel}`,
        );
      }

      for (const model of models) {
        const label = `${candidate.provider}:${model}`;
        if (model !== primaryModel) {
          console.log(`Trying sequential fallback: ${label}`);
        }

        try {
          const sanitized = await callModel(candidate, model, signal);
          const issue = qualityIssue(sanitized);
          if (!issue) return sanitized;
          if (sanitized.length > bestEffort.length) bestEffort = sanitized;
          errors.push(`${label}: low quality (${issue})`);
          allRateLimited = false;
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : String(error);
          const status = (error as { status?: unknown } | null)?.status;
          const rateLimited = status === 429 || /^429\b/.test(message);
          if (!rateLimited) allRateLimited = false;
          errors.push(`${label}: ${message}`);
        }
      }

      throw new CandidateAttemptsFailedError(
        errors.join(" / "),
        bestEffort,
        allRateLimited,
      );
    }

    // ── Hedged race: first *valid* result wins ────────────────────────
    // `degraded` marks a best-effort result that missed the quality gate
    function hedgedGenerate(): Promise<{
      items: NuanceItem[];
      degraded: boolean;
    }> {
      return new Promise((resolve, reject) => {
        const controllers: AbortController[] = [];
        const timeoutTimers: ReturnType<typeof setTimeout>[] = [];
        // Single pending stagger timer — cleared on every start so an
        // immediate failover never leaves a stale timer that would launch
        // extra models later
        let staggerTimer: ReturnType<typeof setTimeout> | null = null;
        let started = 0;
        let failed = 0;
        let settled = false;
        const errors: string[] = [];
        // Largest sanitized result that failed the quality gate — returned
        // as a best effort if no model passes, instead of erroring out
        let bestEffort: NuanceItem[] = [];
        // True only while every recorded failure is an upstream 429
        let allRateLimited = true;

        const clearTimers = () => {
          if (staggerTimer) {
            clearTimeout(staggerTimer);
            staggerTimer = null;
          }
          for (const t of timeoutTimers) clearTimeout(t);
        };

        const startNext = () => {
          if (settled || started >= candidates.length) return;
          if (staggerTimer) {
            clearTimeout(staggerTimer);
            staggerTimer = null;
          }
          const index = started++;
          const candidate = candidates[index];
          const label = candidateLabel(candidate);
          console.log(`Trying model: ${label}`);
          const controller = new AbortController();
          controllers.push(controller);

          // Abort stalled calls so `failed` can always reach MODELS.length
          const timeoutTimer = setTimeout(
            () => controller.abort(),
            candidate.requestTimeoutMs ??
              GENERATION_CONFIG.requests.defaultTimeoutMs,
          );
          timeoutTimers.push(timeoutTimer);

          const onFailure = (message: string, rateLimited = false) => {
            console.warn(`Model failed: ${label}: ${message}`);
            failed++;
            if (settled) return;
            errors.push(`${label}: ${message}`);
            if (!rateLimited) allRateLimited = false;
            if (failed === candidates.length) {
              clearTimers();
              if (
                bestEffort.length >=
                GENERATION_CONFIG.quality.minBestEffortItems
              ) {
                console.warn(
                  `All models below quality bar — returning best effort (${bestEffort.length} items)`,
                );
                resolve({ items: bestEffort, degraded: true });
              } else {
                reject(
                  new AllModelsFailedError(
                    `All models failed. ${errors.join(" / ")}`,
                    allRateLimited,
                  ),
                );
              }
            } else if (failed === started) {
              // Everything in flight already failed — don't wait out the stagger
              startNext();
            }
          };

          callCandidate(candidate, controller.signal)
            .then((sanitized) => {
              clearTimeout(timeoutTimer);
              if (settled) return;
              settled = true;
              console.log(`Winner: ${label} (${sanitized.length} items)`);
              clearTimers();
              controllers.forEach((c, j) => {
                if (j !== index) c.abort();
              });
              resolve({ items: sanitized, degraded: false });
            })
            .catch((err: unknown) => {
              clearTimeout(timeoutTimer);
              if (
                err instanceof CandidateAttemptsFailedError &&
                err.bestEffort.length > bestEffort.length
              ) {
                bestEffort = err.bestEffort;
              }
              const message = err instanceof Error ? err.message : String(err);
              onFailure(
                message,
                err instanceof CandidateAttemptsFailedError &&
                  err.allRateLimited,
              );
            });

          if (started < candidates.length) {
            staggerTimer = setTimeout(
              startNext,
              GENERATION_CONFIG.requests.hedgeStaggerMs,
            );
          }
        };

        startNext();
      });
    }

    const { items, degraded } = await hedgedGenerate();

    // ── Cache result ─────────────────────────────────────────────────
    // Never cache degraded best-effort results — a transient bad generation
    // must not poison the cache; the next request retries the models
    if (!degraded) {
      await cacheSet(cacheKey, items);
    }

    return createSSEStream(items, true, degraded ? { degraded } : undefined);
  } catch (error: unknown) {
    console.error("Error generating nuances:", error);
    if (error instanceof Error && "response" in error) {
      console.error(
        "OpenAI API Response Error:",
        (error as Error & { response: { data: unknown } }).response.data,
      );
    }
    console.error("Providers configured:", buildCandidates().length);
    const message = error instanceof Error ? error.message : "Unknown error";
    // Free-tier quota exhausted upstream — tell the client to back off
    // (only when every model failed with a 429)
    if (error instanceof AllModelsFailedError && error.allRateLimited) {
      // Quota exhausted everywhere: a cached map — even one the client asked
      // to regenerate via skipCache — beats a hard failure
      if (cacheKey) {
        const cached = await cacheGet<NuanceItem>(cacheKey);
        if (cached) {
          console.warn("All providers rate limited — serving cached result");
          return createSSEStream(cached, false, {
            fromCache: true,
            degraded: true,
          });
        }
      }
      return NextResponse.json(
        {
          error: "Upstream rate limited",
          details: message,
          retryAfter: GENERATION_CONFIG.upstreamRetryAfterSeconds,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(GENERATION_CONFIG.upstreamRetryAfterSeconds),
          },
        },
      );
    }
    return NextResponse.json(
      { error: "Internal Server Error", details: message },
      { status: 500 },
    );
  }
}

// Lightweight HEAD handler for preflight cache warming
export async function HEAD() {
  return new Response(null, { status: 200 });
}
