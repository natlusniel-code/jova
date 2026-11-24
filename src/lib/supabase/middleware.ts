import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";
import { authFail, authOk, cookieNames, newCorrelationId } from "@/lib/auth/diagnostics";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Refreshes the Supabase auth session on every request.
 *
 * -- THE BUG THIS FILE USED TO HAVE (root cause of the redirect loop) ---------
 * The old `setAll` did this:
 *
 *     const requestHeaders = new Headers(request.headers);   // snapshot, taken
 *     let response = NextResponse.next({ request: { headers: requestHeaders } });
 *     ...
 *     setAll(cookiesToSet) {
 *       cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
 *       response = NextResponse.next({ request: { headers: requestHeaders } }); // <- STALE
 *       cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(...));
 *     }
 *
 * `request.cookies.set()` DOES mutate `request.headers` - but `requestHeaders`
 * is a *copy* made before that happened. So the rotated token was written to
 * the browser (Set-Cookie on the response) while the request forwarded to the
 * Server Components still carried the OLD cookie header. On the very request
 * where the token was refreshed, every downstream `getSession()` read the
 * expired token, found no user, and redirected to `/auth`.
 *
 * That is why the symptom survived the Clerk -> Firebase swap: this file is
 * provider-agnostic. It was never Firebase's fault.
 *
 * Reproduced in a minimal Next 15 app: with the stale snapshot the page saw
 * `cookie=STALE`; passing the mutated `request it saw `cookie=ROTATED`.
 *
 * -- The fix ------------------------------------------------------------------
 * Pass the live `request` object to `NextResponse.next({ request })`. Next
 * reads `request.headers` at that moment, which already includes the cookies
 * `request.cookies.set()` just wrote. The browser and the Server Components
 * now agree on the session within the same request.
 *
 * Two other hard rules are preserved:
 *
 *  1. The Supabase URL/key come from `./config`, which carries a literal
 *     fallback. Reading `process.env.NEXT_PUBLIC_*` directly here is unsafe:
 *     those are inlined at build time, so a host without the variables
 *     compiles `undefined` into the bundle and `createServerClient` throws.
 *
 *  2. The whole thing is wrapped in try/catch. Middleware runs in front of
 *     every route, so any unhandled throw - a bad env var, a network blip, a
 *     malformed cookie - turns into a 500 for the entire site. A failed session
 *     refresh must degrade to "anonymous visitor", never to a dead site.
 */
export async function updateSession(
  request: NextRequest,
  // Test seam: lets the regression test drive the real cookie-forwarding logic
  // with a stub client, without needing Supabase credentials. Production always
  // uses the default.
  createClient: typeof createServerClient = createServerClient,
) {
  const cid = newCorrelationId();

  // -- Expose the pathname to Server Components ------------------------------
  // A layout cannot read the current URL, but the seller/storefront split
  // needs to know which page is being rendered: a seller is allowed on their
  // own public shop page and on an order detail, and redirected everywhere
  // else. Setting one request header here is cheaper than a DB lookup in
  // middleware and keeps the decision in the layout that already has the
  // session.
  //
  // Set on `request.headers` itself (not a copy) so the value survives the
  // `NextResponse.next({ request })` call below.
  request.headers.set("x-pathname", request.nextUrl.pathname);

  let response = NextResponse.next({ request });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          // 1. Write the rotated cookies onto the REQUEST so the Server
          //    Components rendered by this same request see the new session.
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));

          // 2. Rebuild the response from the now-mutated request. Passing
          //    `request` (not a pre-mutation header snapshot) is the fix.
          response = NextResponse.next({ request });

          // 3. Write the same cookies onto the RESPONSE so the browser stores
          //    them for the next request.
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );

          authOk("middleware.session", cid, {
            event: "cookies.rotated",
            cookie_names: cookieNames(cookiesToSet).join(","),
          });
        },
      },
    });

    // Touching getUser() is what actually refreshes an expired token and
    // writes the rotated cookies onto `response`.
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error) {
      // An expired/absent session is normal for a visitor - log it as a skip,
      // not an error, so real failures stay visible in the log stream.
      authOk("middleware.session", cid, {
        path: request.nextUrl.pathname,
        has_user: false,
        reason: error.message,
      });
    } else {
      authOk("middleware.session", cid, {
        path: request.nextUrl.pathname,
        has_user: Boolean(user),
        user_id: user?.id ?? null,
      });
    }
  } catch (error) {
    // Never let an auth failure take the site down.
    authFail("middleware.session", cid, { path: request.nextUrl.pathname }, error);
  }

  return response;
}
