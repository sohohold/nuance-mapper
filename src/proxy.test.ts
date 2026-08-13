import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { config, proxy } from "@/proxy";

const USER = "preview";
const PASSWORD = "s3cret";

function enableGate() {
  vi.stubEnv("PREVIEW_BASIC_AUTH_USER", USER);
  vi.stubEnv("PREVIEW_BASIC_AUTH_PASSWORD", PASSWORD);
}

function basic(credentials: string): string {
  return `Basic ${Buffer.from(credentials).toString("base64")}`;
}

function request(authorization?: string): NextRequest {
  return new NextRequest("http://preview.example/", {
    headers: authorization ? { authorization } : undefined,
  });
}

describe("proxy", () => {
  it("passes requests through when the gate is not configured", () => {
    const response = proxy(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("WWW-Authenticate")).toBeNull();
  });

  it("stays open when only one half of the credentials is set", () => {
    vi.stubEnv("PREVIEW_BASIC_AUTH_USER", USER);
    expect(proxy(request()).status).toBe(200);
  });

  it("challenges an unauthenticated request once the gate is on", () => {
    enableGate();
    const response = proxy(request());
    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toContain("Basic");
  });

  it("rejects wrong credentials", () => {
    enableGate();
    expect(proxy(request(basic(`${USER}:wrong`))).status).toBe(401);
  });

  // timingSafeEqual throws when the buffers differ in length, so a short
  // password must be rejected rather than turned into a 500.
  it("rejects credentials of a different length", () => {
    enableGate();
    expect(proxy(request(basic("x"))).status).toBe(401);
  });

  it("rejects a malformed Authorization header", () => {
    enableGate();
    expect(proxy(request(`Bearer ${PASSWORD}`)).status).toBe(401);
  });

  it("admits the correct credentials and marks the response noindex", () => {
    enableGate();
    const response = proxy(request(basic(`${USER}:${PASSWORD}`)));
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  });

  it("exempts the health probe from the matcher", () => {
    const [matcher] = config.matcher;
    // Next anchors matcher sources itself; do the same so a partial match
    // further along the path cannot pass for the whole route.
    const pattern = new RegExp(`^${matcher}$`);
    expect(pattern.test("/api/health")).toBe(false);
    expect(pattern.test("/api/generate")).toBe(true);
    expect(pattern.test("/")).toBe(true);
  });
});
