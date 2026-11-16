/**
 * The pure rules of the seller subscription — no database, no `server-only`.
 *
 * ── Why this file exists ──────────────────────────────────────────────
 * `plan-gate.ts` carries `import "server-only"` because it reads the
 * database. But two of its exports are pure functions — `isPremiumSeller`
 * and `subscriptionState` — and the storefront needs them in a CLIENT
 * component: `cards.tsx` renders the Premium badge on a listing card, and
 * that card is pulled into the client bundle by the AI search bar.
 *
 * Importing them from `plan-gate.ts` therefore failed the build:
 *
 *     You're importing a component that needs server-only.
 *
 * The fix is not to drop `server-only` from the gate — that guard is what
 * stops a service-role client leaking into the browser. It is to put the
 * rules that need no database in a module that is safe on both sides, and
 * have the gate re-export them so every existing server import keeps
 * working unchanged.
 *
 * ── The rule itself ───────────────────────────────────────────────────
 * A badge is a public claim about a seller, so it has to be true. A shop
 * whose subscription lapsed, or whose shop is not approved, is not
 * currently a Premium seller — showing the badge would advertise a tier
 * they are no longer paying for. So the badge follows the same rule as
 * the feature gate: the plan must be premium AND the subscription live.
 * One definition, used by every surface that renders it.
 */

export type PlanId = "basic" | "premium";

export type SellerPlan = {
  id: PlanId;
  name: string;
  tagline: string | null;
  price: number;
  features: { key?: string; label: string; included: boolean }[];
  recommended: boolean;
};

/**
 * The subscription state of a shop, in the terms the UI needs.
 *
 * `active` is the only state that unlocks features. `pending` means a
 * receipt is waiting for an admin; `expired` means it lapsed; `none` means
 * they never paid.
 */
export type SubscriptionState = {
  status: "none" | "pending" | "active" | "expired";
  plan: PlanId;
  /** True only when paid, current, and the shop is approved. */
  active: boolean;
  expiresAt: string | null;
  /** Days left, when active. Null otherwise. */
  daysLeft: number | null;
};

export function subscriptionState(shop: {
  subscription_status?: string | null;
  subscription_expires_at?: string | null;
  plan?: string | null;
  status?: string | null;
  verified?: boolean | null;
} | null): SubscriptionState {
  const status = (shop?.subscription_status ?? "none") as SubscriptionState["status"];
  const plan = (shop?.plan === "premium" ? "premium" : "basic") as PlanId;
  const expiresAt = shop?.subscription_expires_at ?? null;

  const notLapsed = !expiresAt || new Date(expiresAt).getTime() > Date.now();
  const approved = shop?.status === "approved" && shop?.verified === true;

  const active = status === "active" && notLapsed && approved;

  const daysLeft = expiresAt
    ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000))
    : null;

  return { status, plan, active, expiresAt, daysLeft };
}

/**
 * Should this shop show the Premium badge on the storefront?
 *
 * See the header: the plan must be premium AND the subscription live AND
 * the shop approved. A lapsed seller keeps their plan column but loses the
 * badge, which is the honest outcome.
 */
export function isPremiumSeller(shop: {
  plan?: string | null;
  subscription_status?: string | null;
  subscription_expires_at?: string | null;
  status?: string | null;
} | null): boolean {
  if (!shop) return false;
  if (shop.plan !== "premium") return false;
  if (shop.subscription_status !== "active") return false;
  if (shop.status && shop.status !== "approved") return false;

  const expiresAt = shop.subscription_expires_at;
  if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) return false;

  return true;
}

/**
 * The path a seller should be sent to when a feature is locked.
 *
 * A seller with no subscription goes to the plan comparison; one whose
 * subscription lapsed goes to renew; a Basic seller goes to upgrade. All
 * three land on the same page, but the query string lets it open on the
 * right tab with the right message.
 */
export function upgradePath(state: SubscriptionState): string {
  if (state.status === "expired") return "/seller/subscription?renew=1";
  if (state.status === "pending") return "/seller/subscription?pending=1";
  if (state.status === "active" && state.plan === "basic") {
    return "/seller/subscription?upgrade=1";
  }
  return "/seller/subscription";
}
