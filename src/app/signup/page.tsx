import { AuthSplit } from "@/components/auth-split";
import { ClerkAuthPanel } from "@/components/clerk-auth-panel";
import { getSession } from "@/lib/supabase/server";
import { signedInLanding } from "@/lib/auth/landing";
import { hasClerkSessionWithoutJova } from "@/lib/auth/resume";
import { safeNextPath } from "@/lib/safe-next";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const metadata = { title: "Create your account" };

/**
 * `/signup` — create a Jova account.
 *
 * `?role=seller` preselects the seller card. `?next=` is a same-origin path
 * only, so it can never become an open redirect.
 *
 * ── Why the guard ───────────────────────────────────────────────────────────
 * This page had none, and that was the "You're already signed in" dead end: a
 * person with a live session could open /signup, fill the whole form in, and
 * only then be told the account exists. Worse, the refusal sent them to /auth,
 * which saw the live session and sent them back — a loop.
 *
 * A signed-in visitor is now sent straight to where their role belongs, before
 * any form renders.
 *
 * ── Why the bridge is NOT called here ───────────────────────────────────────
 * An earlier version called `bridgeClerkSession()` during render to resume a
 * half-finished sign-in. That cannot work: the bridge mints a Supabase session,
 * which WRITES cookies, and `cookies()` is read-only inside a Server Component.
 * The call throws, the page 500s, and the person sees a broken signup page
 * instead of a resumed session.
 *
 * So the resume is a redirect to `/auth/resume`, a route handler, which is
 * allowed to write cookies. One hop, and it works.
 */
export default async function SignupPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<{
    role?: string;
    next?: string;
    existing?: string;
    fresh?: string;
  }>;
}) {
  const searchParams = await searchParamsPromise;

  const initialRole =
    searchParams?.role === "seller"
      ? ("seller" as const)
      : searchParams?.role === "buyer"
        ? ("buyer" as const)
        : null;

  const next = safeNextPath(searchParams?.next) ?? undefined;

  // Already signed in? There is nothing to create. Send them where they
  // belong instead of showing a form that can only fail.
  const session = await getSession();
  if (session) redirect(next ?? signedInLanding(session));

  // A live Clerk session with no Jova session: finish it rather than showing a
  // sign-up form that Clerk will refuse to start. See src/lib/auth/resume.ts.
  //
  // `fresh=1` is set by /auth/resume when it found a Clerk identity with no
  // Jova account. That is the one case where the resume check must be skipped:
  // resuming again would send them straight back, forever. The panel clears the
  // stale Clerk session before starting a new sign-up.
  const fresh = searchParams?.fresh === "1";
  if (!fresh && (await hasClerkSessionWithoutJova())) {
    redirect(
      next ? `/auth/resume?next=${encodeURIComponent(next)}` : "/auth/resume",
    );
  }

  return (
    <AuthSplit>
      <ClerkAuthPanel
        mode="signup"
        initialRole={initialRole}
        next={next}
        existing={searchParams?.existing === "1"}
        clearStaleSession={fresh}
      />
    </AuthSplit>
  );
}
