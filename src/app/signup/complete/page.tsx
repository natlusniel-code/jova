import { redirect } from "next/navigation";
import { AuthSplit } from "@/components/auth-split";
import { getSession } from "@/lib/supabase/server";
import { CompleteProfile } from "@/components/signup/complete-profile";

export const dynamic = "force-dynamic";
export const metadata = { title: "Finish your account" };

/**
 * `/signup/complete` — the step a Google buyer lands on.
 *
 * ── Why this page exists ──────────────────────────────────────────────────
 * Google gives us a name and a verified email, and nothing else. Jova
 * needs two more things before a buyer can actually use the marketplace:
 *
 *   • a phone number — it is the password-reset factor, and the only way a
 *     seller or support can reach them about an order;
 *   • a state and local government — buyers can only order from sellers in
 *     their own city, so without an LGA the storefront is empty for them.
 *
 * So a Google signup is not finished when the account is created. It is
 * finished here. The guard below is what makes that true: a signed-out visitor
 * is sent to sign in, and a buyer who has already filled this in is sent on to
 * the storefront, so the page cannot be used to loop or to skip.
 */
export default async function SignupCompletePage() {
  const session = await getSession();

  // No session: the Google round trip did not complete. Start again.
  if (!session) redirect("/auth");

  // Already complete — nothing to collect. Sellers have their own flow.
  if (session.profile.phone && session.profile.city) {
    redirect(session.profile.role === "seller" ? "/seller/onboarding?step=1" : "/");
  }

  return (
    <AuthSplit>
      <CompleteProfile
        initial={{
          full_name: session.profile.full_name ?? "",
          phone: session.profile.phone ?? "",
          state: session.profile.state ?? "Ogun",
          city: session.profile.city ?? "Abeokuta South",
        }}
      />
    </AuthSplit>
  );
}
