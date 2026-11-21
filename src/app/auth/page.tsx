import { AuthSplit } from "@/components/auth-split";
import { SignInVideo } from "@/components/signin-video";
import { ClerkAuthPanel } from "@/components/clerk-auth-panel";
import { getSession, createClient } from "@/lib/supabase/server";
import { getLoginMedia } from "@/lib/login-media";
import { postAuthDestination } from "@/lib/post-auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const metadata = { title: "Log in" };

export default async function AuthPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<{
    next?: string;
    noaccount?: string;
    existing?: string;
  }>;
}) {
  const searchParams = await searchParamsPromise;
  const raw = searchParams?.next ?? "";
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : undefined;

  // Never send an authenticated visitor through the generic dashboard.
  // Buyers go straight to the storefront; sellers go to their current
  // onboarding step or the approved Seller Hub.
  const session = await getSession();
  if (session) {
    const destination = await postAuthDestination(
      createClient(),
      session.user.id,
      next,
      session.profile.role,
    );
    redirect(destination);
  }

  const media = await getLoginMedia();
  const noAccount = searchParams?.noaccount === "1";

  return (
    <AuthSplit media={<SignInVideo src={media.video} poster={media.poster} compact />}>
      <ClerkAuthPanel mode="signin" next={next} noAccount={noAccount} />
    </AuthSplit>
  );
}
