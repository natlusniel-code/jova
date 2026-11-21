import { AuthSplit } from "@/components/auth-split";
import { SignInVideo } from "@/components/signin-video";
import { ClerkAuthPanel } from "@/components/clerk-auth-panel";
import { getSession } from "@/lib/supabase/server";
import { getLoginMedia } from "@/lib/login-media";
import { signedInLanding } from "@/lib/auth/landing";
import { hasClerkSessionWithoutJova } from "@/lib/auth/resume";
import { safeNextPath } from "@/lib/safe-next";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const metadata = { title: "Log in" };

/**
 * `/auth` — log in.
 *
 * ── Why the guard ───────────────────────────────────────────────────────────
 * `getSession()` runs on the server before anything renders, so a signed-in
 * visitor never sees a login screen and there is no flash of auth UI before
 * the redirect.
 *
 * ── Why it no longer goes to /dashboard ─────────────────────────────────────
 * It used to send EVERY signed-in visitor to `/dashboard`, which is neither
 * the buyer's storefront nor the seller's hub. `signedInLanding` applies the
 * same role rule the rest of the app uses: buyer → storefront, seller → hub or
 * the onboarding step they are on.
 *
 * A `?next=` is honoured when it is safe, so a deep link that bounced someone
 * to login still lands them where they were going.
 */
export default async function AuthPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<{
    next?: string;
    noaccount?: string;
    existing?: string;
    resume?: string;
  }>;
}) {
  const searchParams = await searchParamsPromise;

  // Only a same-origin relative path is carried through the OAuth round trip,
  // and never one that points back at the auth pages.
  const next = safeNextPath(searchParams?.next) ?? undefined;

  const session = await getSession();
  if (session) redirect(next ?? signedInLanding(session));

  // ── A live Clerk session with no Jova session ─────────────────────────────
  // Clerk's cookie outlives the Supabase one. When it is still there but the
  // marketplace's session is gone, rendering the form is a trap: every
  // provider button fails, because Clerk will not start a second sign-in for
  // an account that is already active. Finish the session instead.
  if (await hasClerkSessionWithoutJova()) {
    redirect(
      next ? `/auth/resume?next=${encodeURIComponent(next)}` : "/auth/resume",
    );
  }

  // The video is admin-editable (sql/0047). Read on the server so the
  // configured source is in the first HTML response — no flash of the
  // default before the real one loads.
  const media = await getLoginMedia();

  const noAccount = searchParams?.noaccount === "1";

  return (
    <AuthSplit media={<SignInVideo src={media.video} poster={media.poster} compact />}>
      <ClerkAuthPanel mode="signin" next={next} noAccount={noAccount} />
    </AuthSplit>
  );
}
