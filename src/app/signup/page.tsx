import { AuthSplit } from "@/components/auth-split";
import { ClerkAuthPanel } from "@/components/clerk-auth-panel";

export const metadata = { title: "Create your account" };

/**
 * `/signup` — the SIGN-UP page, separate from login.
 *
 * ── Why it is no longer a redirect ──────────────────────────────────────────
 * This used to 302 to `/auth`, because there was one combined auth screen.
 * The brief asks for a real split: login and sign-up are two pages with two
 * different jobs, and they now differ in behaviour as well as copy.
 *
 * ── What is kept ────────────────────────────────────────────────────────────
 * The page keeps the same `AuthSplit` shell and the same role-choice visual as
 * the previous sign-up design — two cards, same copy, same styling. The role
 * is preselected when `?role=seller` is passed (the seller-onboarding "create
 * a seller account" link), so those links still land correctly.
 *
 * ── What changed with Clerk ─────────────────────────────────────────────────
 * The panel is `ClerkAuthPanel` in `mode="signup"`. The role choice is still
 * the first thing on the page and still gates the provider buttons, because
 * with any provider we get a name and a verified email but no idea what the
 * person came to do — so the choice has to be made before it can travel
 * through the OAuth round trip.
 *
 * `?existing=1` is set by the bridge when the address already has an account;
 * the panel turns it into "you already have an account — log in instead".
 * `?next=` is a same-origin path only, so it can never become an open
 * redirect.
 */
export default async function SignupPage({
  searchParams: searchParamsPromise,
}: {
  // Next 15: search params arrive as a Promise.
  searchParams: Promise<{ role?: string; next?: string; existing?: string }>;
}) {
  const searchParams = await searchParamsPromise;
  const initialRole =
    searchParams?.role === "seller"
      ? ("seller" as const)
      : searchParams?.role === "buyer"
        ? ("buyer" as const)
        : null;

  const raw = searchParams?.next ?? "";
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : undefined;

  return (
    <AuthSplit>
      <ClerkAuthPanel
        mode="signup"
        initialRole={initialRole}
        next={next}
        existing={searchParams?.existing === "1"}
      />
    </AuthSplit>
  );
}
