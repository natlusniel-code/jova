import { AuthSplit } from "@/components/auth-split";
import { SignInVideo } from "@/components/signin-video";
import { FirebaseAuthPanel } from "@/components/firebase-auth-panel";
import { getSession } from "@/lib/supabase/server";
import { getLoginMedia } from "@/lib/login-media";
import { signedInLanding } from "@/lib/auth/landing";
import { safeNextPath } from "@/lib/safe-next";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const metadata = { title: "Log in" };

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
      <FirebaseAuthPanel mode="signin" next={next} />
    </AuthSplit>
  );
}
