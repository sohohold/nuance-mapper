import { NextResponse } from "next/server";

/**
 * Liveness endpoint for AppRun's health check.
 *
 * The probe used to request `/`, which renders the whole page on every
 * check and — once the preview gate in `proxy.ts` is active — answers 401,
 * which AppRun would read as a dead instance. This route is cheap and is
 * excluded from the gate's matcher, so it answers 200 in every environment.
 */

// Never prerender: a cached 200 baked in at build time would report the
// health of the build, not of the instance actually answering the probe.
export const dynamic = "force-dynamic";

export function GET() {
  // `revision` identifies the build that is actually serving. Without it the
  // only way to tell which image an AppRun version is running is to look for
  // a behavioural difference, which is a slow way to discover that a reused
  // tag resolved to an older digest.
  return NextResponse.json({
    status: "ok",
    revision: process.env.BUILD_REVISION || null,
  });
}
