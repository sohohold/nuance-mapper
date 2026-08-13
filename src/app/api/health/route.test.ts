import { describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  it("answers 200 so AppRun's probe can mark the version healthy", async () => {
    const response = GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "ok" });
  });

  it("reports the build revision when the image carries one", async () => {
    vi.stubEnv("BUILD_REVISION", "a4eb065");
    await expect(GET().json()).resolves.toEqual({
      status: "ok",
      revision: "a4eb065",
    });
  });

  it("reports null rather than an empty string when unset", async () => {
    vi.stubEnv("BUILD_REVISION", "");
    await expect(GET().json()).resolves.toEqual({
      status: "ok",
      revision: null,
    });
  });
});
