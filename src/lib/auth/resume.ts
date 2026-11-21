import "server-only";

import { auth } from "@clerk/nextjs/server";
import { CLERK_CONFIGURED } from "@/lib/clerk/config";

/**
 * Is there a live Clerk session with no Jova session behind it?
 *
 * ── Why the auth pages have to ask ──────────────────────────────────────────
 * The marketplace reads the SUPABASE cookie. Clerk's session is separate and
 * outlives it. When Clerk still has the person signed in but the Supabase
 * cookie is gone, the auth page sees "not signed in" and renders the login
 * form — and every provider button then fails, because Clerk will not start a
 * second sign-in for an account that is already active. The person is stuck
 * on a login page they cannot get past, which is the "You're already signed
 * in" report.
 *
 * So before rendering the form, the page asks this. A `true` answer means
 * "there is a session to finish, not a form to fill in", and the page sends
 * them to `/auth/resume`, which mints the Supabase cookie and forwards them to
 * their role's landing page.
 *
 * ── Why it is cheap ─────────────────────────────────────────────────────────
 * `auth()` reads the already-verified session from the request headers that
 * `clerkMiddleware` attached — no network call, no user fetch. It is only
 * consulted when there is no Supabase session, which is the rare path.
 *
 * ── Why it never throws ─────────────────────────────────────────────────────
 * Without a publishable key there is no Clerk session at all, and `auth()`
 * would throw. The guard below returns `false` in that case, so a deployment
 * with no key still renders the "not configured" notice instead of a 500.
 */
export async function hasClerkSessionWithoutJova(): Promise<boolean> {
  if (!CLERK_CONFIGURED) return false;

  try {
    const { userId } = await auth();
    return Boolean(userId);
  } catch {
    // A Clerk outage must not take the auth pages down. Treat it as "no
    // session" and let the form render; the panel reports its own errors.
    return false;
  }
}
