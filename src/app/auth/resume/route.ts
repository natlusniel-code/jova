import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { bridgeClerkSession } from "@/app/auth/clerk-actions";
import { safeNextPath } from "@/lib/safe-next";
import { CLERK_CONFIGURED } from "@/lib/clerk/config";

export const dynamic = "force-dynamic";

/**
 * `/auth/resume` — finish a sign-in that Clerk already completed.
 *
 * ── The bug this fixes ──────────────────────────────────────────────────────
 * Clerk and Supabase are two sessions. Clerk's lives in its own cookie and
 * survives for days; Jova's Supabase cookie is what the marketplace reads, and
 * it can be missing while Clerk's is still live. That happens when:
 *
 *   • the Supabase cookie expired or was cleared (a browser cleanup, a
 *     different subdomain, a cookie-size eviction);
 *   • the bridge failed on the first attempt (a network blip, a cold start);
 *   • the person signed in on another tab and came back to this one.
 *
 * In every one of those cases the auth pages saw "no Supabase session" and
 * rendered the login form — while Clerk, behind the scenes, still had them
 * signed in. Pressing "Continue with Google" then bounced them straight back,
 * because Clerk refused to start a second sign-in for an account that was
 * already active. That is the "You're already signed in" loop.
 *
 * ── Why a route handler and not the page ────────────────────────────────────
 * Minting the Supabase session WRITES cookies, and `cookies()` is read-only in
 * a Server Component. A route handler can write them, so the bridge runs here
 * and the browser is redirected to wherever the server says they belong.
 *
 * This is also why `/signup` must not call the bridge during render: it would
 * throw on the cookie write. It redirects here instead.
 *
 * ── Why it is safe to call ──────────────────────────────────────────────────
 * It reads the identity from the Clerk session on the server — the browser
 * sends no user id, so it cannot be used to mint a session for an account the
 * caller does not own. `mode` is `signin`, so a missing Jova account is
 * refused rather than created: this route can only resume an existing account.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const next = safeNextPath(url.searchParams.get("next"));

  // No Clerk key: there is no session to resume. Back to the login page, which
  // explains what is missing.
  if (!CLERK_CONFIGURED) {
    return NextResponse.redirect(new URL("/auth", url.origin));
  }

  const { userId } = await auth();

  // No Clerk session either — nothing to resume. The login page is correct.
  if (!userId) {
    const back = new URL("/auth", url.origin);
    if (next) back.searchParams.set("next", next);
    return NextResponse.redirect(back);
  }

  try {
    const result = await bridgeClerkSession({ mode: "signin", next });

    if (result.ok) {
      return NextResponse.redirect(new URL(result.next, url.origin));
    }

    // The Clerk identity has no Jova account. That is a real answer, not a
    // failure — but it must NOT go to /signup unqualified: /signup runs the
    // same resume check, sees the same live Clerk session, and sends them
    // straight back here. That is a loop.
    //
    // `fresh=1` tells the sign-up page to skip the resume check and clear the
    // stale Clerk session first, so the form can actually start a new sign-up.
    if (result.noAccount) {
      const signup = new URL("/signup", url.origin);
      signup.searchParams.set("fresh", "1");
      if (next) signup.searchParams.set("next", next);
      return NextResponse.redirect(signup);
    }

    const failed = new URL("/auth", url.origin);
    failed.searchParams.set("resume", "failed");
    return NextResponse.redirect(failed);
  } catch {
    // A bridge failure must not strand the person on a blank page. The login
    // page can start a fresh sign-in.
    const failed = new URL("/auth", url.origin);
    failed.searchParams.set("resume", "failed");
    return NextResponse.redirect(failed);
  }
}
