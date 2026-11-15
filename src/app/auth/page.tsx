import { AuthSplit } from "@/components/auth-split";
import { SignInVideo } from "@/components/signin-video";
import { LoginGlassPanel } from "@/components/login-glass-panel";
import { getSession } from "@/lib/supabase/server";
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
      <div className="mb-4">
        <SignInVideo />
      </div>
      <LoginGlassPanel next={next} noAccount={noAccount} errorMessage={errorMessage} />
    </AuthSplit>
  );
}
