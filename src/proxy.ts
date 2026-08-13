import { timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Access gate for preview deployments.
 *
 * AppRun has no equivalent of Vercel's deployment protection, so the
 * per-pull-request environments are closed off in the application instead.
 * Preview deployments set PREVIEW_AUTH_REQUIRED before they are published.
 * Until both credentials are present, requests fail closed with 503; this
 * keeps a newly-created preview private while its password is being installed
 * as an AppRun secret. Production sets neither the flag nor credentials, so
 * this file is inert outside previews.
 *
 * `/api/health` is deliberately outside the matcher: AppRun's health check
 * carries no credentials, and a 401 there would keep the version from ever
 * being marked healthy.
 */

const WWW_AUTHENTICATE = 'Basic realm="Preview", charset="UTF-8"';
const NO_INDEX = "noindex, nofollow";
const NO_STORE = "no-store";

function expectedCredentials(): string | null {
  const user = process.env.PREVIEW_BASIC_AUTH_USER;
  const password = process.env.PREVIEW_BASIC_AUTH_PASSWORD;
  if (!user || !password) return null;
  return `${user}:${password}`;
}

function decodeBasic(header: string | null): string | null {
  if (!header?.startsWith("Basic ")) return null;
  try {
    return Buffer.from(header.slice("Basic ".length), "base64").toString(
      "utf8",
    );
  } catch {
    return null;
  }
}

function credentialsMatch(supplied: string, expected: string): boolean {
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on differing lengths, so the lengths are compared
  // up front. That leaks the credential length, which is not worth hiding
  // for a gate whose only job is to keep previews out of public view.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function proxy(request: NextRequest) {
  const expected = expectedCredentials();
  if (!expected) {
    if (process.env.PREVIEW_AUTH_REQUIRED !== "true") {
      return NextResponse.next();
    }

    return new NextResponse("Preview authentication is not ready", {
      status: 503,
      headers: {
        "Cache-Control": NO_STORE,
        "Retry-After": "10",
        "X-Robots-Tag": NO_INDEX,
      },
    });
  }

  const supplied = decodeBasic(request.headers.get("authorization"));
  if (!supplied || !credentialsMatch(supplied, expected)) {
    return new NextResponse("Authentication required", {
      status: 401,
      headers: {
        "WWW-Authenticate": WWW_AUTHENTICATE,
        "X-Robots-Tag": NO_INDEX,
      },
    });
  }

  const response = NextResponse.next();
  response.headers.set("X-Robots-Tag", NO_INDEX);
  return response;
}

export const config = {
  matcher: [
    // Everything except the health probe and build output.
    "/((?!api/health|_next/static|_next/image|favicon.ico).*)",
  ],
};
