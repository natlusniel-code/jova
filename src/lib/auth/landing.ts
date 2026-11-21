import { sellerGatePath } from "@/lib/seller-gate";
import { isBuyerAccount } from "@/lib/roles";

/**
 * Where an ALREADY signed-in person belongs.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * `/auth` and `/signup` both need the same answer, and both used to compute it
 * differently — one through `postAuthDestination`, one not at all. Two answers
 * to one question is how a buyer ends up on a seller page.
 *
 * The rule is the marketplace's existing one: a buyer belongs on the
 * storefront, a seller on the Seller Hub or the onboarding step they are on.
 *
 * ── Why it takes the session, not a user id ─────────────────────────────────
 * `getSession()` has already read the profile and the shop in one round of
 * queries. Re-reading them here would be a second round for the same facts,
 * and the two reads could disagree if a role changed in between.
 */
export type LandingSession = {
  profile: { role?: string | null } | null;
  shop: {
    id?: string | null;
    status?: string | null;
    verified?: boolean | null;
    subscription_status?: string | null;
    bank_account_number?: string | null;
  } | null;
} | null;

export function signedInLanding(session: LandingSession): string {
  if (!session) return "/";

  // A buyer belongs on the storefront, full stop — even if a stale `shops` row
  // points at their account.
  if (isBuyerAccount(session.profile, session.shop)) return "/";

  // A seller with a shop goes to the exact onboarding step they are on, or to
  // the hub once an admin has approved and verified them.
  if (session.shop) {
    const gate = sellerGatePath(session.shop);
    return gate ?? "/seller";
  }

  // A seller with no shop yet is at step 1 of onboarding.
  if (session.profile?.role === "seller") return "/seller/onboarding?step=1";

  return "/";
}
