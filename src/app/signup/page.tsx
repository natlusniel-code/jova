import { AuthSplit } from "@/components/auth-split";
import { SignUpForm } from "@/components/signup-form";
import { getSession } from "@/lib/supabase/server";
import { signedInLanding } from "@/lib/auth/landing";
import { safeNextPath } from "@/lib/safe-next";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const metadata = { title: "Create your account" };

/**
 * `/signup` — the registration page.
 *
 * Email + password only. The account is created already confirmed and signed
 * in by the server action, so there is no verification step to get stuck on.
 */
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
      <SignUpForm initialRole={initialRole} next={next} />
    </AuthSplit>
  );
}
