import { NextRequest, NextResponse } from "next/server";

// NOTE: this file runs on the Edge runtime, which cannot load Prisma/bcrypt.
// It therefore only does two lightweight, non-authoritative things:
//   1. Set a per-request nonce-based Content-Security-Policy.
//   2. Bounce obviously-logged-out visitors away from /dashboard for UX.
// The real authorization (role + school scoping, disabled-account checks,
// tokenVersion revocation) happens server-side on every page and server
// action via requireUser()/requireAdmin()/requireSchoolAccess() in
// src/lib/session.ts, which run in the Node runtime.

const SESSION_COOKIE_NAMES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
];

function hasSessionCookie(request: NextRequest): boolean {
  return SESSION_COOKIE_NAMES.some((name) => request.cookies.has(name));
}

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  // script-src is nonce-based and strict (the meaningful XSS defense).
  // style-src allows 'unsafe-inline' without a nonce: Next.js (next/image
  // sizing, dev overlay) injects inline style attributes it can't attach a
  // nonce to, and CSS injection alone can't execute script in modern
  // browsers, so this is a deliberately looser, lower-risk allowance.
  const csp = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic';
    style-src 'self' 'unsafe-inline';
    img-src 'self' blob: data: https:;
    font-src 'self' data:;
    connect-src 'self';
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    upgrade-insecure-requests;
  `
    .replace(/\s{2,}/g, " ")
    .trim();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  if (request.nextUrl.pathname.startsWith("/dashboard") && !hasSessionCookie(request)) {
    const loginUrl = new URL("/login", request.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
