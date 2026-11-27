import { redirect } from "next/navigation";
import { AuthSplit } from "@/components/auth-split";
import { SignupDetails } from "@/components/signup/signup-details";
import { getSession } from "@/lib/supabase/server";
import { signedInLanding } from "@/lib/auth/landing";
import { safeNextPath } from "@/lib/safe-next";

export const dynamic = "force-dynamic";
export const metadata = { title: "Create an account" };

/**
 * `/signup/details` — step two: the Clerk credential step, then the Jova account.
 *
 * ── What this page asks for now ─────────────────────────────────────────────
 * Clerk's `<SignUp />` collects the name, email and password (and verifies the
 * email, which the old form never did). The role still comes from step one and
 * is written to `public.profiles` by the bridge — it is a marketplace fact, not
 * an identity fact, so Clerk never sees it.
 *
 * ── Why the role is required here ───────────────────────────────────────────
 * The role decides where the account lands and what the next screen asks
 * for, so a details page with no role is a dead end: the form would have to
 * guess, and a guess is how a seller ends up in the buyer storefront. A
 * missing or unknown role is sent back to step one rather than defaulted.
 *
 * ── Why the guard ───────────────────────────────────────────────────────────
 * Same as `/signup`: a signed-in visitor is redirected before render, so
 * there is no flash of a sign-up form for someone who already has an
 * account.
 */
export default async function SignupDetailsPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<{ role?: string; next?: string }>;
}) {
  const searchParams = await searchParamsPromise;
  const next = safeNextPath(searchParams?.next) ?? undefined;

  const session = await getSession();
  if (session) redirect(next ?? signedInLanding(session));

  const role = searchParams?.role;
  if (role !== "buyer" && role !== "seller") {
    redirect("/signup");
  }

  return (
    <AuthSplit>
      <SignupDetails role={role} next={next} />
    </AuthSplit>
  );
}
