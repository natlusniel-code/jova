import { AuthSplit } from "@/components/auth-split";
import { SignInVideo } from "@/components/signin-video";
import { SignInForm } from "@/components/signin-form";
import { getSession } from "@/lib/supabase/server";
import { getLoginMedia } from "@/lib/login-media";
import { signedInLanding } from "@/lib/auth/landing";
import { safeNextPath } from "@/lib/safe-next";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const metadata = { title: "Log in" };

/**
 * `/auth` — the sign-in page.
 *
 * ── The layout is the one the site had before the auth rework ──────────
 * The video sits at the top of the action column, directly above the email
 * and password form, and the form is the same one that has always been here.
 * The rework had moved the video into the brand panel as a small `compact`
 * strip, which is why the login page stopped looking like itself: the video
 * is the first thing a returning buyer sees, and it belongs over the form,
 * not tucked into the marketing column.
 *
 * ── Why the video is read on the server ────────────────────────────────
 * `getLoginMedia()` reads `platform_settings` (sql/0047), so the configured
 * source is in the first HTML response — no flash of the bundled default
 * before the real one appears. An admin can change it without a deploy.
 *
 * ── Why the guard ──────────────────────────────────────────────────────
 * `getSession()` runs before anything renders, so a signed-in visitor never
 * sees a login screen and there is no flash of auth UI before the redirect.
 * A safe `?next=` is honoured, so a deep link that bounced someone here still
 * lands them where they were going.
 */
export default async function AuthPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const searchParams = await searchParamsPromise;
  const next = safeNextPath(searchParams?.next) ?? undefined;

  const session = await getSession();
  if (session) redirect(next ?? signedInLanding(session));

  const media = await getLoginMedia();

  return (
    <AuthSplit>
      {/* ── Spacing between the video and the form ──────────────────────
          The video and the form are two separate blocks with a real gap
          between them, not one crowded stack. The video keeps its own
          rounded frame and caption; the form starts below it with `mt-7`,
          so the "Welcome back" heading never sits on the video's caption. */}
      <SignInVideo src={media.video} poster={media.poster} />
      <div className="mt-7">
        <SignInForm next={next} />
      </div>
    </AuthSplit>
  );
}
