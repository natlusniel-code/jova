/**
 * Public Appwrite configuration.
 *
 * All three values are safe to ship to the browser: the endpoint is a URL, the
 * project ID identifies the project, and the project name is a label. None of
 * them authorise anything. Access is controlled by the Appwrite session and by
 * the Google OAuth client secret, which lives ONLY in the Appwrite Console and
 * never appears in this repo.
 *
 * ── Why env vars with a literal fallback ────────────────────────────────────
 * Same reasoning as `src/lib/supabase/config.ts`. Next.js inlines
 * `NEXT_PUBLIC_*` at BUILD time, so a host with no variables set would compile
 * `undefined` into the bundle and every Appwrite call would fail with a
 * confusing "project is required" error. The fallback makes the build
 * deterministic: the app works whether or not the host has the variables, and
 * setting them still overrides the default.
 *
 * Kept in its own module (no `"use client"`, no SDK import) so both the browser
 * client and the server bridge can read it without dragging the Web SDK into a
 * Server Component.
 */

export const APPWRITE_ENDPOINT =
  process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || "https://nyc.cloud.appwrite.io/v1";

export const APPWRITE_PROJECT_ID =
  process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || "6af94f00001c084b1bdf";

export const APPWRITE_PROJECT_NAME =
  process.env.NEXT_PUBLIC_APPWRITE_PROJECT_NAME || "NaijaMart";

/** True when both values resolved to something non-empty. */
export const APPWRITE_CONFIGURED = Boolean(APPWRITE_ENDPOINT && APPWRITE_PROJECT_ID);

/**
 * The ONE origin Google may send the browser back to.
 *
 * ── Why this is a constant and not `window.location.origin` ──────────
 * This was the actual cause of "Google sign-in did not complete" in
 * production. The OAuth start call passed `success`/`failure` URLs built from
 * whatever host the browser happened to be on. Appwrite only accepts a
 * redirect that matches a Web platform registered on the project, and it
 * rejects anything else with:
 *
 *   Error 400  Invalid `success` param: Invalid URI.
 *              Register your new client (<host>) as a new Web platform
 *
 * The project has `naijamart-marketplace-opal.vercel.app` registered (note the
 * "ai"). Every preview deployment, every alias, and every typo'd host —
 * including `njamart-marketplace-opal.vercel.app`, which is what the bug report
 * was opened from — is a DIFFERENT origin, so the OAuth start failed before
 * the browser ever reached Google.
 *
 * Pinning the origin makes the redirect independent of which host served the
 * page. Set `NEXT_PUBLIC_APP_URL` when the canonical domain changes; a
 * localhost origin is still used as-is because those are registered on the
 * project for development.
 */
export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || "https://naijamart-marketplace-opal.vercel.app";

/**
 * The origin to hand to Appwrite for the OAuth redirect.
 *
 * Local development keeps its own origin (registered on the project); every
 * deployed host — production, a preview alias, a mistyped domain — resolves to
 * the canonical `APP_URL` so the round trip always lands on an allowed URI.
 */
export function oauthOrigin(here: string): string {
  if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(here)) {
    return here;
  }
  return APP_URL;
}
