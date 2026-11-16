import { AuthSplit } from "@/components/auth-split";
import { SignInVideo } from "@/components/signin-video";
import { LoginGlassPanel } from "@/components/login-glass-panel";
import { getSession } from "@/lib/supabase/server";
import { getLoginMedia } from "@/lib/login-media";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const metadata = { title: "Log in" };

/**
 * `/auth` — the LOGIN page.
 *
 * ── Layout ──────────────────────────────────────────────────────
 * Video first, unchanged: same component, same file, same poster, same silent
 * autoplay behaviour. Directly underneath it sits the Google action, inside a
 * translucent glass card that overlaps the video's bottom edge so the screen
 * reads as one object. Below that, the "Create an account" link — login and
 * sign-up are now two separate pages, and this is the door between them.
 *
 * ── Why the guard ───────────────────────────────────────────────
 * `getSession()` runs on the server before anything renders, so a signed-in
 * visitor never sees a login screen and there is no flash of auth UI before
 * the redirect.
 */
export default async function AuthPage({
  searchParams,
}: {
  searchParams?: {
    next?: string;
    noaccount?: string;
    existing?: string;
  };
}) {
  const session = await getSession();
  if (session) redirect("/dashboard");

  // The video is admin-editable (sql/0047). Read on the server so the
  // configured source is in the first HTML response — no flash of the
  // default before the real one loads.
  const media = await getLoginMedia();

  // Only a same-origin relative path is carried through the OAuth round trip.
  const raw = searchParams?.next ?? "";
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : undefined;

  const noAccount = searchParams?.noaccount === "1";

  // Someone who already has an account landed on login — that is the happy
  // path here, so nothing to report. `existing` only means something on
  // /signup, and /auth never renders it.
  const errorMessage = "";

  return (
    <AuthSplit>
      {/* ── Spacing between the video and the actions ────────────────────
          The video and the glass panel used to be packed together: the
          panel pulled itself up with `-mt-7` to overlap the video's bottom
          edge, and the wrapper added only `mb-4`. On a phone that read as
          one crowded block — the button sat on top of the caption.

          The overlap is kept (it is what makes the two read as one object)
          but it is now a deliberate, smaller overlap, and the space below
          the panel is opened up so the button, the helper line and the
          "Create an account" link each have room. */}
      <div className="mb-1">
        <SignInVideo src={media.video} poster={media.poster} />
      </div>
      <LoginGlassPanel next={next} noAccount={noAccount} errorMessage={errorMessage} />
    </AuthSplit>
  );
}
