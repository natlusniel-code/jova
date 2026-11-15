import "server-only";

import { VAPID_PUBLIC_KEY } from "./push-public";

/**
 * Web Push (VAPID) server configuration.
 *
 * ── Why the private key is committed here ──────────────────────────────────
 * This is the ORIGINAL key pair the site has always used, restored in code
 * after the move to environment variables broke delivery. The deployment never
 * had `VAPID_PRIVATE_KEY` set, so `webPushConfig()` threw, `dispatchPush()`
 * returned "not configured", and no notification was ever signed or sent —
 * while every existing subscription row stayed bound to this key.
 *
 * The pair is verified: the private scalar below derives exactly the public
 * point in `push-public.ts`, and a sign/verify round-trip with the two passes.
 *
 * ── What this costs ────────────────────────────────────────────────────────
 * Anyone with read access to this repository can sign a push and deliver it to
 * a subscriber of this site. Web Push has no other authenticator. The blast
 * radius is narrow — it cannot read data or act as a user, only raise a
 * notification — but it is real, and it is why this repository must stay
 * PRIVATE (already a hard requirement, because of the Supabase service-role
 * key).
 *
 * ── Rotating ───────────────────────────────────────────────────────────────
 * Rotating invalidates every existing subscription: a subscription is bound to
 * the public key it was created with. Devices re-subscribe automatically on
 * next load, because `ensurePushSubscription()` runs on every signed-in page —
 * but only if BOTH halves are changed together, in `push-public.ts` and here.
 */

/** The VAPID private key. Server-only; never import this from a client module. */
export const VAPID_PRIVATE_KEY =
  "REDACTED_VAPID_PRIVATE_KEY";

/** VAPID subject: a mailto: or https: URL identifying the sender to the push service. */
export const VAPID_SUBJECT = "mailto:support@naijamart.ng";

export type WebPushConfig = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

/**
 * The VAPID triple.
 *
 * Always returns a config: the pair is in code, so there is no "unconfigured"
 * state to degrade into. Kept as a function so callers do not change shape.
 */
export function webPushConfigOrNull(): WebPushConfig | null {
  return {
    publicKey: VAPID_PUBLIC_KEY,
    privateKey: VAPID_PRIVATE_KEY,
    subject: VAPID_SUBJECT,
  };
}

/** The VAPID triple for signing a push. */
export function webPushConfig(): WebPushConfig {
  return {
    publicKey: VAPID_PUBLIC_KEY,
    privateKey: VAPID_PRIVATE_KEY,
    subject: VAPID_SUBJECT,
  };
}
