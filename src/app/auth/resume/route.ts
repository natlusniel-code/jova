import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/safe-next";

export const dynamic = "force-dynamic";

/**
 * `/auth/resume` — legacy Clerk-era entry point, now a plain redirect.
 *
 * ── Why this is no longer a bridge ───────────────────────────────────────────
 * Under Clerk this route existed because Clerk and Supabase were two separate
 * sessions: Clerk's cookie could outlive the Supabase one, so the page had to
 * "resume" a sign-in that Clerk had already completed.
 *
 * Firebase has no server-readable session cookie. The identity lives in the
 * Firebase client SDK and is proven to the server by an ID token, which the
 * bridge verifies. There is therefore nothing to resume here — and keeping the
 * old Clerk code was actively harmful: `auth()` from `@clerk/nextjs/server`
 * threw (no Clerk secret key), the catch swallowed it, and the route redirected
 * to `/auth`. Any stale `__session` cookie from the Clerk era, or any bookmark
 * of this URL, produced exactly the reported symptom: an authenticated person
 * being sent back to the sign-in page.
 *
 * So it now does the only correct thing: forward to `/auth`, preserving a safe
 * `next`. `/auth` itself checks the Supabase session first and redirects a
 * signed-in person straight to their destination, so this cannot loop.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const next = safeNextPath(url.searchParams.get("next"));

  const target = new URL("/auth", url.origin);
  if (next) target.searchParams.set("next", next);

  return NextResponse.redirect(target);
}
