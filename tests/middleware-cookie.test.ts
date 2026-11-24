/**
 * Regression test for the ROOT CAUSE of the auth redirect loop.
 *
 * Run: npm run test:middleware
 *
 * ── The bug ──────────────────────────────────────────────────────────────────
 * `updateSession` used to snapshot `request.headers` into `requestHeaders`
 * BEFORE `@supabase/ssr` called `setAll`. `setAll` then did
 * `request.cookies.set(...)` (which mutates `request.headers`) but rebuilt the
 * response from the STALE `requestHeaders` snapshot. Result: the rotated token
 * went to the browser via Set-Cookie, while the Server Components rendered by
 * that same request still saw the OLD cookie — found no user, and redirected to
 * `/auth`.
 *
 * This test drives the REAL `updateSession` with a stub Supabase client that
 * rotates a cookie, and asserts the forwarded request carries the NEW value.
 * No credentials needed.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";

import { updateSession } from "../src/lib/supabase/middleware";

type CookieAdapter = {
  getAll(): { name: string; value: string }[];
  setAll(cookies: { name: string; value: string; options?: Record<string, unknown> }[]): void;
};

/**
 * A stand-in for `createServerClient` that behaves like `@supabase/ssr` on a
 * token refresh: it calls `setAll` with a rotated cookie, then reports the user.
 */
function stubClient(behaviour: "rotate" | "throw") {
  return ((_url: string, _key: string, opts: { cookies: CookieAdapter }) => {
    if (behaviour === "throw") {
      throw new Error("simulated Supabase outage");
    }
    return {
      auth: {
        async getUser() {
          // This is what @supabase/ssr does when the access token is expired:
          // it refreshes and writes the new cookies through the adapter.
          opts.cookies.setAll([
            { name: "sb-test-auth-token.0", value: "ROTATED", options: { path: "/" } },
          ]);
          return { data: { user: { id: "user-1" } }, error: null };
        },
      },
    };
  }) as never;
}

function makeRequest(cookieValue: string) {
  return new NextRequest("https://jova.test/orders", {
    headers: { cookie: `sb-test-auth-token.0=${cookieValue}` },
  });
}

test("middleware forwards the ROTATED cookie to Server Components", async () => {
  const request = makeRequest("STALE");

  const response = await updateSession(request, stubClient("rotate"));

  // 1. The browser must receive the rotated cookie.
  const setCookie = response.headers.getSetCookie().join(";");
  assert.match(setCookie, /sb-test-auth-token\.0=ROTATED/, "response must set the rotated cookie");

  // 2. THE REGRESSION. Next forwards the request headers to Server Components
  //    via `x-middleware-request-*` / `x-middleware-override-headers` on the
  //    response. Before the fix these carried the pre-rotation snapshot, so the
  //    page saw the expired token and redirected to /auth.
  const forwardedCookie = response.headers.get("x-middleware-request-cookie") ?? "";
  assert.match(
    forwardedCookie,
    /sb-test-auth-token\.0=ROTATED/,
    `forwarded request cookie must be rotated, got: ${forwardedCookie}`,
  );
  assert.doesNotMatch(
    forwardedCookie,
    /STALE/,
    "the stale value must not be forwarded to Server Components",
  );
});

test("middleware still exposes x-pathname to Server Components", async () => {
  const request = makeRequest("STALE");
  await updateSession(request, stubClient("rotate"));
  assert.equal(request.headers.get("x-pathname"), "/orders");
});

test("middleware never throws when the session refresh fails", async () => {
  // A Supabase outage must degrade to "anonymous", never to a 500 for the
  // whole site.
  const request = makeRequest("STALE");
  const response = await updateSession(request, stubClient("throw"));
  assert.ok(response, "a response must still be returned");
});
