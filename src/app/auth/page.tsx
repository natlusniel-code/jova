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
 * Email + password, checked by Supabase against the account's existing
 * password hash. A signed-in visitor is sent straight to their destination, so
 * this page can never be shown to someone who already has a session.
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
    <AuthSplit media={<SignInVideo src={media.video} poster={media.poster} compact />}>
      <SignInForm next={next} />
    </AuthSplit>
  );
}
