import { redirect } from "next/navigation";
import { AuthSplit } from "@/components/auth-split";
import { RoleChoice } from "@/components/signup/role-choice";
import { getSession } from "@/lib/supabase/server";
import { signedInLanding } from "@/lib/auth/landing";
import { safeNextPath } from "@/lib/safe-next";

export const dynamic = "force-dynamic";
export const metadata = { title: "Create an account" };

/**
 * `/signup` — step one: buyer or seller.
 *
 * ── Why this is a page again ───────────────────────────────────────────
 * The auth rework folded the role into a single long form, which is why the
 * sign-up page stopped looking like the site. The original flow asked the
 * question on its own screen, with two big cards and an icon each, and that
 * is what is restored here: one decision, two obvious answers, then the
 * details form on the next step.
 *
 * ── Why the guard ──────────────────────────────────────────────────────
 * A signed-in visitor has no business on a sign-up screen, so they are sent
 * to where they belong before anything renders. `?next=` is preserved so a
 * deep link that bounced someone here still completes.
 */
export default async function SignupPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<{ next?: string; role?: string }>;
}) {
  const searchParams = await searchParamsPromise;
  const next = safeNextPath(searchParams?.next) ?? undefined;

  const session = await getSession();
  if (session) redirect(next ?? signedInLanding(session));

  const initialRole =
    searchParams?.role === "seller" || searchParams?.role === "buyer"
      ? searchParams.role
      : null;

  return (
    <AuthSplit>
      <RoleChoice initialRole={initialRole} next={next} />
    </AuthSplit>
  );
}
