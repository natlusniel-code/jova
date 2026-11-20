import { NextResponse, type NextRequest, type NextFetchEvent } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { clerkMiddleware } from "@clerk/nextjs/server";
import { updateSession } from "@/lib/supabase/middleware";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/config";
import { CLERK_CONFIGURED } from "@/lib/clerk/config";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * The admin console path.
 *
 * It is deliberately unguessable rather than `/admin`, and that is NOT the
 * security — the gate below is. The path is kept as-is so existing links and
 * bookmarks keep working.
 */
const ADMIN_ROOT = "/admin-fuckliving";

/** The one admin page that must stay reachable without a session. */
const ADMIN_LOGIN = "/admin-fuckliving/login";

/**
 * The request work that does not belong to Clerk.
 *
 * Two jobs, in this order:
 *
 *  1. Refresh the Supabase session on every request (the existing behaviour,
 *     unchanged — it degrades to "anonymous" rather than 500-ing the site).
 *  2. Gate the admin console.
 *
 * This is pulled out of `middleware` because it has to be reachable from two
 * places: inside Clerk's handler on a normal request, and directly as a
 * fallback if Clerk itself fails. See `middleware` at the bottom.
 *
 * ── Why the admin gate lives here ────────────────────────────────────────────
 * The console used to have no gate at all: the layout said so explicitly, on
 * the theory that server-side data fetching with the service-role key made it
 * safe. It does not. The key protects the transport, not the endpoint — any
 * visitor who knew the URL could open the dashboard and, through the Server
 * Actions, verify payments and release payouts.
 *
 * ── Why a non-admin gets a 404 and not a redirect ────────────────────────────
 * A redirect to the login page would confirm that the console exists and that
 * the account simply lacks the role. A 404 says nothing: to a non-admin the
 * path is indistinguishable from a typo. The login page itself is exempt, so
 * an admin can still get in.
 *
 * ── Why the admin check is a query and not a JWT claim ───────────────────────
 * `is_admin()` reads `public.admin_users`. A claim in the token could be
 * stale after a demotion, and `user_metadata` is client-writable. The row is
 * the truth, so the row is what is read. The `admin_users_self` RLS policy
 * lets a signed-in user select their own row, which is exactly this query.
 *
 * ── Why the admin gate did NOT move to Clerk ─────────────────────────────────
 * Clerk tells us WHO someone is; it does not know that they are a Jova admin.
 * Admin status lives in `public.admin_users`, keyed on the Supabase user id,
 * and is granted there. So the gate keeps reading the Supabase session and the
 * `admin_users` row. Switching it to a Clerk claim would move the source of
 * truth for a security decision into the identity provider, where a demotion
 * would not take effect until the next token refresh.
 */
async function handleRequest(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // The session refresh returns the response whose cookies carry the rotated
  // token. The admin check reuses those cookies.
  const response = await updateSession(request);

  if (!pathname.startsWith(ADMIN_ROOT)) return response;

  // The login page is the way in; it must not be gated by itself.
  if (pathname === ADMIN_LOGIN || pathname.startsWith(`${ADMIN_LOGIN}/`)) {
    return response;
  }

  try {
    const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();

    // No session at all → the admin login page.
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = ADMIN_LOGIN;
      url.search = "";
      // Remember where they were going, so a successful login lands there.
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }

    // A session that is not an admin → 404, revealing nothing.
    const { data: adminRow } = await supabase
      .from("admin_users")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!adminRow) {
      const url = request.nextUrl.clone();
      url.pathname = "/not-found";
      url.search = "";
      return NextResponse.rewrite(url, { status: 404 });
    }

    return response;
  } catch (error) {
    // A failed check must never open the console. Fail closed: treat it as
    // "not an admin" and send them to the login page.
    console.error("[middleware] admin gate failed:", error);
    const url = request.nextUrl.clone();
    url.pathname = ADMIN_LOGIN;
    url.search = "";
    return NextResponse.redirect(url);
  }
}

/**
 * Clerk's middleware, with the app's own work nested inside it.
 *
 * ── Why nested rather than sequenced ────────────────────────────────────────
 * `clerkMiddleware` is not a thing you call for its side effects and ignore.
 * It reads the Clerk session cookie, may attach `x-clerk-auth-*` request
 * headers, and — importantly — writes `Set-Cookie` headers onto the response it
 * returns, refreshing the Clerk session token as it ages. Calling it and
 * discarding its response, as an earlier draft did, would have thrown those
 * headers away and signed people out whenever their Clerk token rotated.
 *
 * So it goes on the OUTSIDE: Clerk runs its handler, we return our Supabase
 * response from inside that handler, and Clerk merges its own headers onto the
 * response we hand back. Both cookie sets survive, which is what "signed in to
 * Clerk AND signed in to Supabase" requires.
 *
 * ── What this enables ───────────────────────────────────────────────────────
 * `auth()` and `currentUser()` in Server Components and Server Actions only see
 * a session because this middleware ran. `bridgeClerkSession` depends on them,
 * so removing this breaks sign-in entirely.
 */
const withClerk = clerkMiddleware(async (_auth, request) => {
  return handleRequest(request);
});

/**
 * Middleware.
 *
 * Clerk first, then the app's own session refresh and admin gate. If Clerk
 * cannot run — no publishable key configured in this environment, or a Clerk
 * outage — the app's own work still runs, so the marketplace is readable
 * instead of returning 500 on every route. Sign-in then fails with a clear
 * message from the panel rather than the whole site going dark.
 */
export async function middleware(request: NextRequest, event: NextFetchEvent) {
  if (!CLERK_CONFIGURED) {
    // No key: the Clerk SDK cannot boot at all. Do the app's work directly.
    return handleRequest(request);
  }

  try {
    return (await withClerk(request, event)) as NextResponse;
  } catch (error) {
    // Middleware runs in front of every route, so an unhandled throw here is a
    // 500 for the entire site. Degrade to "anonymous" instead.
    console.error("[middleware] Clerk failed, continuing without it:", error);
    return handleRequest(request);
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
