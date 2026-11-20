import { AuthSplit } from "@/components/auth-split";
import { SignInVideo } from "@/components/signin-video";
import { ClerkAuthPanel } from "@/components/clerk-auth-panel";
import { getSession } from "@/lib/supabase/server";
import { getLoginMedia } from "@/lib/login-media";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const metadata = { title: "Log in" };

/**
 * `/auth` — the LOGIN page.
 *
 * ── Layout ──────────────────────────────────────────────────────────────────
 * Video first, unchanged: same component, same file, same poster, same silent
 * autoplay behaviour. Directly underneath it sits the auth panel, which now
 * offers four ways in — Google, Apple, LinkedIn and an emailed one-time code.
 * Below that, the "Create an account" link: login and sign-up are two separate
 * pages, and this is the door between them.
 *
 * ── What changed with Clerk ─────────────────────────────────────────────────
 * The panel is `ClerkAuthPanel` instead of `LoginGlassPanel`. The old panel
 * offered Google alone, because Appwrite was the only identity provider wired
 * up. Clerk brings the other three methods, so the panel grew — but the page
 * shell, the video, the split layout and the copy are all the same, which is
 * what keeps the screen recognisably Jova.
 *
 * ── Why the guard ───────────────────────────────────────────────────────────
 * `getSession()` runs on the server before anything renders, so a signed-in
 * visitor never sees a login screen and there is no flash of auth UI before
 * the redirect.
 */
export default async function AuthPage({
  searchParams: searchParamsPromise,
}: {
  // Next 15: search params arrive as a Promise.
  searchParams: Promise<{
    next?: string;
    noaccount?: string;
    existing?: string;
  }>;
}) {
  const searchParams = await searchParamsPromise;
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
  return (
    <AuthSplit>
      <SignInVideo src={media.video} poster={media.poster} />
      <ClerkAuthPanel
        mode="signin"
        next={next}
        noAccount={noAccount}
      />
    </AuthSplit>
  );
}
