/**
 * Application settings and tuning reference.
 *
 * Keep non-secret operational values in this file so provider changes,
 * timeout tuning, quotas, cache policy, and map behavior can be reviewed in
 * one place. API key values remain in environment variables; only their names
 * are declared here.
 */

const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export interface ModelToolOutputConfig {
  /** Token budget for providers that return entries through a tool call. */
  maxCompletionTokens: number;
  /** Keep reasoning low because the task is structured and latency-sensitive. */
  reasoningEffort: "low";
}

export interface ModelProviderConfig {
  /** Stable provider id used in logs and the resolved-model cache. */
  provider: string;
  /** Environment variable containing this provider's API key. */
  apiKeyEnv: string;
  /** OpenAI-compatible API root. */
  baseURL: string;
  /** Preference order; the first currently available model is selected. */
  models: readonly string[];
  /** Optional request timeout override for slower providers. */
  requestTimeoutMs?: number;
  /** Optional tool-call output settings for providers needing stricter JSON. */
  toolOutput?: ModelToolOutputConfig;
}

/**
 * Hedged provider ladder. Order controls failover order, while `models` order
 * controls the preferred model within each provider.
 */
export const MODEL_PROVIDERS = [
  {
    provider: "gemini",
    apiKeyEnv: "GEMINI_API_KEY",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    models: [
      "gemini-flash-lite-latest",
      "gemini-flash-latest",
      "gemini-2.5-flash-lite",
      "gemini-2.5-flash",
    ],
  },
  {
    provider: "groq",
    apiKeyEnv: "GROQ_API_KEY",
    baseURL: "https://api.groq.com/openai/v1",
    models: [
      "openai/gpt-oss-120b",
      "openai/gpt-oss-20b",
      "llama-3.3-70b-versatile",
    ],
  },
  {
    provider: "cerebras",
    apiKeyEnv: "CEREBRAS_API_KEY",
    baseURL: "https://api.cerebras.ai/v1",
    models: ["gpt-oss-120b", "zai-glm-4.7", "qwen-3-32b", "llama-3.3-70b"],
  },
  {
    provider: "openrouter",
    apiKeyEnv: "OPENROUTER_API_KEY",
    baseURL: "https://openrouter.ai/api/v1",
    models: ["openai/gpt-oss-20b:free", "openrouter/free"],
    requestTimeoutMs: 55 * SECOND_MS,
    toolOutput: {
      maxCompletionTokens: 4_000,
      reasoningEffort: "low",
    },
  },
] as const satisfies readonly ModelProviderConfig[];

export const GENERATION_CONFIG = {
  /** Provider `/models` lookup policy for free-tier model churn. */
  modelResolve: {
    timeoutMs: 2 * SECOND_MS,
    successTtlMs: HOUR_MS,
    retryTtlMs: 5 * MINUTE_MS,
  },
  /** Request timing and SDK retry policy for the hedged provider ladder. */
  requests: {
    hedgeStaggerMs: 7 * SECOND_MS,
    defaultTimeoutMs: 25 * SECOND_MS,
    sdkMaxRetries: 0,
  },
  /** Limits applied before user input is interpolated into the prompt. */
  input: {
    maxWordLength: 64,
    maxAxisLabelLength: 80,
  },
  /** Prompt targets that define the generated map's density and range. */
  prompt: {
    axisMax: 10,
    targetItems: 20,
    edgeThreshold: 7,
  },
  /** Hard caps applied to untrusted model output before caching or streaming. */
  output: {
    maxItems: 40,
    maxWordLength: 60,
    maxNuanceLength: 120,
  },
  /** Minimum shape of a normal result; smaller outputs trigger failover. */
  quality: {
    minItems: 12,
    minQuadrants: 3,
    minBestEffortItems: 3,
  },
  /** Delay between SSE items, used only for the visual reveal animation. */
  streamItemDelayMs: 40,
  /** Retry hint returned when every configured upstream is rate-limited. */
  upstreamRetryAfterSeconds: 60,
  /** Coordinate used by the no-key mock response in opposite quadrants. */
  mockCoordinateOffset: 5,
} as const;

export const CACHE_CONFIG = {
  /** Maximum entries retained by the per-process memory fallback. */
  maxEntries: 200,
  /** Lifetime shared by Redis and the local fallback cache. */
  ttlMs: 30 * DAY_MS,
  /** Namespace/version prefix for Redis keys. Bump to invalidate old data. */
  redisKeyPrefix: "nuance:v1:",
  /** Redis latency ceiling; timeout is treated as a cache miss. */
  redisTimeoutMs: 2 * SECOND_MS,
} as const;

export const RATE_LIMIT_CONFIG = {
  /** Requests accepted per client IP within one fixed window. */
  maxRequests: 10,
  /** Duration of one rate-limit window. */
  windowMs: MINUTE_MS,
  /** How often expired in-memory counters are removed. */
  cleanupIntervalMs: MINUTE_MS,
} as const;

export const MAP_CONFIG = {
  /** Viewport width at which the compact map geometry is enabled. */
  mobileBreakpointPx: 640,
  /** Canvas pixels represented by one generated coordinate unit. */
  scale: {
    desktop: 50,
    mobile: 20,
  },
  /** Large origin-node bounds that allow both axes to span the canvas. */
  originSizePx: 2_000,
  /** Axis stroke switches at the compact scale to survive overview zoom. */
  axisLine: {
    compactScaleThresholdPx: 30,
    desktopWidthPx: 3,
    mobileWidthPx: 5,
  },
  /** Axis tick range and spacing in generated coordinate units. */
  ticks: {
    min: -10,
    max: 10,
    step: 2,
  },
  /** Pan/zoom limits exposed by React Flow. */
  zoom: {
    desktopMin: 0.5,
    mobileMin: 0.25,
    max: 4,
  },
  /** Auto-framing behavior after streamed nodes settle. */
  fitView: {
    settleDelayMs: 300,
    durationMs: 800,
    desktopPadding: 0.2,
    mobilePadding: 0.15,
  },
  /** Timing and edge handling for word-detail tooltips. */
  tooltip: {
    hideDelayMs: 200,
    copiedIndicatorMs: 1_500,
    flipThresholdRatio: 0.4,
    edgePaddingPx: 8,
    verticalGapPx: 15,
  },
  /** Rounding factor used only to group points with equal coordinates. */
  coordinateRoundingFactor: 1_000,
} as const;
