/**
 * Model resolution is cached in a module-level map for an hour, so these
 * tests import the route through `vi.resetModules()` to get a cold cache.
 * Keeping them in their own file stops that reset from disturbing the main
 * route suite.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GENERATION_CONFIG, MODEL_PROVIDERS } from "@/lib/config";

const { createMock, cacheGetMock, cacheSetMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  cacheGetMock: vi.fn(),
  cacheSetMock: vi.fn(),
}));

vi.mock("openai", () => ({
  default: class MockOpenAI {
    chat = { completions: { create: createMock } };
  },
}));

vi.mock("@/lib/cache", () => ({
  cacheGet: cacheGetMock,
  cacheSet: cacheSetMock,
}));

const GEMINI = MODEL_PROVIDERS[0];

const GOOD_ITEMS = Array.from(
  { length: GENERATION_CONFIG.quality.minItems },
  (_, i) => {
    const [sx, sy] = [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ][i % 4];
    return { word: `語${i}`, x: sx * (1 + i), y: sy * (1 + i), nuance: "" };
  },
);

let ip = 0;
function request() {
  return new Request("http://localhost/api/generate", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": `172.16.0.${ip++ % 250}.${Math.random()}`,
    },
    body: JSON.stringify({ word: "すごい", xAxis: "X", yAxis: "Y" }),
  });
}

async function drain(res: Response) {
  await res.text();
}

/** A route module with an empty resolved-model cache. */
async function freshRoute() {
  vi.resetModules();
  return import("@/app/api/generate/route");
}

let modelsFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  for (const provider of MODEL_PROVIDERS) vi.stubEnv(provider.apiKeyEnv, "");
  vi.stubEnv(GEMINI.apiKeyEnv, "test-key");

  cacheGetMock.mockResolvedValue(undefined);
  cacheSetMock.mockResolvedValue(undefined);
  createMock.mockResolvedValue({
    choices: [{ message: { content: JSON.stringify(GOOD_ITEMS) } }],
  });

  modelsFetch = vi.fn(async () =>
    Response.json({ data: GEMINI.models.map((id) => ({ id })) }),
  );
  vi.stubGlobal("fetch", modelsFetch);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("model resolution", () => {
  it("asks the provider which models it currently serves", async () => {
    const { POST } = await freshRoute();
    await drain(await POST(request()));

    expect(modelsFetch).toHaveBeenCalledTimes(1);
    expect(String(modelsFetch.mock.calls[0][0])).toContain("/models");
  });

  it("reuses the answer for the next request", async () => {
    const { POST } = await freshRoute();
    await drain(await POST(request()));
    await drain(await POST(request()));

    expect(modelsFetch).toHaveBeenCalledTimes(1);
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it("picks the first preferred model the provider actually lists", async () => {
    modelsFetch.mockResolvedValue(
      // The head of the preference list is gone
      Response.json({ data: GEMINI.models.slice(1).map((id) => ({ id })) }),
    );
    const { POST } = await freshRoute();
    await drain(await POST(request()));

    expect(createMock.mock.calls[0][0].model).toBe(GEMINI.models[1]);
  });

  it("tolerates a provider prefixing ids with models/", async () => {
    modelsFetch.mockResolvedValue(
      Response.json({
        data: GEMINI.models.map((id) => ({ id: `models/${id}` })),
      }),
    );
    const { POST } = await freshRoute();
    await drain(await POST(request()));

    expect(createMock.mock.calls[0][0].model).toBe(GEMINI.models[0]);
  });

  it("falls back to the preferred model when the lookup fails", async () => {
    modelsFetch.mockRejectedValue(new Error("lookup down"));
    const { POST } = await freshRoute();
    const res = await POST(request());
    await drain(res);

    expect(res.status).toBe(200);
    expect(createMock.mock.calls[0][0].model).toBe(GEMINI.models[0]);
  });

  it("does not block generation when the lookup returns an error status", async () => {
    modelsFetch.mockResolvedValue(new Response("nope", { status: 503 }));
    const { POST } = await freshRoute();
    expect((await POST(request())).status).toBe(200);
  });
});
