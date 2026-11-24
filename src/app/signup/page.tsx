import { AuthSplit } from "@/components/auth-split";
import { FirebaseAuthPanel } from "@/components/firebase-auth-panel";
import { getSession } from "@/lib/supabase/server";
import { signedInLanding } from "@/lib/auth/landing";
import { safeNextPath } from "@/lib/safe-next";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const metadata = { title: "Create your account" };

export default async function SignupPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<{ role?: string; next?: string }>;
}) {
  const searchParams = await searchParamsPromise;
  const initialRole =
    searchParams?.role === "seller"
      ? ("seller" as const)
      : searchParams?.role === "buyer"
        ? ("buyer" as const)
        : null;
  const next = safeNextPath(searchParams?.next) ?? undefined;

  const session = await getSession();
  if (session) redirect(next ?? signedInLanding(session));

  return (
    <AuthSplit>
      <FirebaseAuthPanel mode="signup" initialRole={initialRole} next={next} />
    </AuthSplit>
  );
}
