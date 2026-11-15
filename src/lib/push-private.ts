import "server-only";

import { VAPID_PUBLIC_KEY } from "./push-public";

/**
 * Web Push (VAPID) server configuration.
 *
 * ── The private key is NOT in this file ───────────────────────────────────
 * It is read from `VAPID_PRIVATE_KEY` and from nowhere else. There is no
 * committed fallback, and there must never be one again: this key was
 * committed once, purged from all 99 commits of history, and then
 * accidentally re-committed. A VAPID private key is the only thing that
 * authenticates a push to a subscriber, so anyone who can read the repository
 * could sign a notification and deliver it to every subscriber of this site.
 *
 * ── Why the public key IS a literal ───────────────────────────────────────
 * `push-public.ts` keeps the original public key in code, and that is
 * deliberate. A VAPID public key is not a secret — it is handed to every
 * browser that subscribes, and it is inlined into the client bundle either
 * way. Keeping it fixed is also what makes existing subscriptions keep
 * working: a subscription is bound to the public key it was created with, so
 * a stable public key means no one has to re-subscribe.
 *
 * ── Why the pair must match ───────────────────────────────────────────────
 * The server can only sign for a subscription with the private key matching
 * the public key that subscription was created with. So `VAPID_PRIVATE_KEY`
 * in the deployment MUST be the private half of `VAPID_PUBLIC_KEY` in
 * `push-public.ts`. If they do not match, every send is rejected by the push
 * service with 403 and nothing is delivered.
 *
 * ── Failing loudly ────────────────────────────────────────────────────────
 * A missing key throws rather than degrading to "not configured". A silent
 * skip is how the previous outage went unnoticed: `dispatchPush()` reported
 * success while no notification was ever signed. `webPushConfigOrNull()` is
 * kept for callers that genuinely want to probe without throwing.
 */

/** VAPID subject: a mailto: or https: URL identifying the sender to the push service. */
export const VAPID_SUBJECT =
  process.env.VAPID_SUBJECT || "mailto:support@naijamart.ng";

export type WebPushConfig = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

/**
 * The VAPID private key, or null when the deployment has not set it.
 *
 * Trimmed because a trailing newline pasted into a dashboard is the single
 * most common way this variable arrives broken, and a key with a newline
 * fails to parse with a message that does not mention whitespace.
 */
function privateKey(): string | null {
  const key = process.env.VAPID_PRIVATE_KEY?.trim();
  return key ? key : null;
}

/**
 * The VAPID triple, or null when the private key is missing.
 *
 * For callers that want to report "push is not configured" instead of
 * throwing — the jobs endpoint uses this so a missing key does not fail the
 * whole run.
 */
export function webPushConfigOrNull(): WebPushConfig | null {
  const key = privateKey();
  if (!key) return null;

  return {
    publicKey: VAPID_PUBLIC_KEY,
    privateKey: key,
    subject: VAPID_SUBJECT,
  };
}

/**
 * The VAPID triple for signing a push.
 *
 * Throws when `VAPID_PRIVATE_KEY` is unset. That is intentional: a push that
 * cannot be signed is a bug in the deployment, and it should surface as one
 * rather than as a notification that quietly never arrives.
 */
export function webPushConfig(): WebPushConfig {
  const config = webPushConfigOrNull();

  if (!config) {
    throw new Error(
      "VAPID_PRIVATE_KEY is not set. Web Push cannot sign a notification without it. " +
        "Set it in the deployment environment (Vercel → Project Settings → " +
        "Environment Variables, Production and Preview). It must be the private " +
        "half of the public key in src/lib/push-public.ts.",
    );
  }

  return config;
}
