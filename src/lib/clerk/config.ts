/**
 * Public Clerk configuration.
 *
 * ── Why the publishable key is safe in the bundle ────────────────────────────
 * `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is a `pk_test_…` / `pk_live_…` value. It
 * identifies the Clerk instance to the browser SDK; it authorises nothing. The
 * secret key (`sk_…`) is what can read and write users, and it lives ONLY in
 * the deployment environment — never here, never in the bundle.
 *
 * ── Why there is no literal fallback ─────────────────────────────────────────
 * Unlike the Supabase config, a publishable key is instance-specific: a
 * hardcoded fallback would silently point a fork at someone else's Clerk
 * instance. So the value is read from the environment and the app fails loudly
 * (see `clerkConfigured`) rather than pretending to be configured.
 */

export const CLERK_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() ?? "";

/** True when the browser SDK has a key to boot with. */
export const CLERK_CONFIGURED = CLERK_PUBLISHABLE_KEY.length > 0;

/**
 * The canonical origin, used for OAuth redirect URLs.
 *
 * Clerk validates the redirect against the instance's allowed origins, so the
 * value must be stable across preview aliases and typos — the same reasoning
 * that pinned the Appwrite origin. Localhost is kept as-is for development.
 */
export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  "https://naijamart-marketplace-opal.vercel.app";

/** The origin to hand Clerk for an OAuth round trip. */
export function oauthOrigin(here: string): string {
  if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(here)) {
    return here;
  }
  return APP_URL;
}

/**
 * The auth methods Jova offers, in the order they appear on screen.
 *
 * `strategy` is the Clerk OAuth strategy string. LinkedIn uses the OIDC
 * connection (`oauth_linkedin_oidc`), which is the one Clerk recommends and the
 * one enabled on the instance — the legacy `oauth_linkedin` connection is a
 * different provider and would fail with "strategy not enabled".
 */
export const OAUTH_PROVIDERS = [
  { key: "google", label: "Google", strategy: "oauth_google" },
  { key: "apple", label: "Apple", strategy: "oauth_apple" },
  { key: "linkedin", label: "LinkedIn", strategy: "oauth_linkedin_oidc" },
] as const;

export type OAuthProviderKey = (typeof OAUTH_PROVIDERS)[number]["key"];
