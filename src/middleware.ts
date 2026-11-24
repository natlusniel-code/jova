import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { updateSession } from "@/lib/supabase/middleware";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/config";

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
 * Firebase is the public identity provider. Do not run Clerk middleware here:
 * the old Clerk wrapper must not participate in requests or response-cookie
 * handling during the Firebase migration. Supabase remains the app session
 * authority and its refresh/admin gate still runs for every matched request.
 */
export async function middleware(request: NextRequest) {
  return handleRequest(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
