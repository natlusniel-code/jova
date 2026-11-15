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
