import "server-only";

/**
 * Web Push (VAPID) server configuration.
 *
 * ── Why the private key is NOT here ────────────────────────────────────────
 * This module used to export `FALLBACK_VAPID_PRIVATE_KEY`, a real committed
 * VAPID signing key. Anyone with read access to the repository could sign a
 * push and deliver it to any subscriber of this site — Web Push has no other
 * authenticator. That key has been removed and purged from history.
 *
 * The private key is now read from `VAPID_PRIVATE_KEY` and nowhere else. There
 * is no fallback: `webPushConfig()` throws when it is missing, so a
 * misconfigured deployment fails loudly instead of shipping a known key.
 *
 * ── Rotating ───────────────────────────────────────────────────────────────
 * Rotating the pair invalidates every existing subscription; devices
 * re-subscribe automatically on next load, because `ensurePushSubscription()`
 * runs on every signed-in page. The PUBLIC half must move to
 * `NEXT_PUBLIC_VAPID_PUBLIC_KEY` at the same time — see `push-public.ts`.
 */

/** VAPID subject: a mailto: or https: URL identifying the sender to the push service. */
export const VAPID_SUBJECT_FALLBACK = "mailto:support@naijamart.ng";

export type WebPushConfig = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

/**
 * The VAPID triple, or `null` when the server is not configured for push.
 *
 * Returns `null` rather than throwing so read paths (a page asking "should I
 * show the enable-notifications button?") can degrade quietly, while the send
 * path (`webPushConfig()`) still refuses to sign with a missing key.
 */
export function webPushConfigOrNull(): WebPushConfig | null {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? "";
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim() ?? "";

  if (!publicKey || !privateKey) return null;

  return {
    publicKey,
    privateKey,
    subject: process.env.VAPID_SUBJECT?.trim() || VAPID_SUBJECT_FALLBACK,
  };
}

/**
 * The VAPID triple for signing a push.
 *
 * Throws — it never substitutes a committed key. There is no such key any more.
 */
export function webPushConfig(): WebPushConfig {
  const config = webPushConfigOrNull();
  if (!config) {
    throw new Error(
      "Web Push is not configured: set VAPID_PRIVATE_KEY and NEXT_PUBLIC_VAPID_PUBLIC_KEY " +
        "in the deployment environment (never commit them).",
    );
  }
  return config;
}
