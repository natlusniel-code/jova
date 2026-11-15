import "server-only";

import { VAPID_PUBLIC_KEY } from "./push-public";

/**
 * Web Push (VAPID) server configuration.
 *
 * ── The private key IS in this file, deliberately ────────────────────────
 * This is the ORIGINAL key pair the site has always used, restored in code at
 * the owner's explicit request so that Web Push — and the nomination flow that
 * depends on it — works without any deployment environment variable.
 *
 * The trade is understood and accepted: a VAPID private key is the only thing
 * that authenticates a push to a subscriber, so anyone who can read this
 * repository could sign a notification and deliver it to every subscriber of
 * this site. `VAPID_PRIVATE_KEY` still overrides it, so rotating to an
 * environment-only key later needs no code change.
 *
 * ── Why the pair must match ──────────────────────────────────────────────
 * The server can only sign for a subscription with the private key matching
 * the public key that subscription was created with. The constant below was
 * verified to derive exactly `VAPID_PUBLIC_KEY` in `push-public.ts` (P-256,
 * 32-byte scalar → 65-byte uncompressed point). Changing one without the
 * other silently breaks every existing subscriber with a 403 from the push
 * service.
 *
 * ── Failing loudly ───────────────────────────────────────────────────────
 * A missing key throws rather than degrading to "not configured". A silent
 * skip is how a previous outage went unnoticed: `dispatchPush()` reported
 * success while no notification was ever signed. `webPushConfigOrNull()` is
 * kept for callers that genuinely want to probe without throwing.
 */

/** VAPID subject: a mailto: or https: URL identifying the sender to the push service. */
export const VAPID_SUBJECT =
  process.env.VAPID_SUBJECT || "mailto:support@naijamart.ng";

/**
 * The original VAPID private key, paired with `VAPID_PUBLIC_KEY`.
 *
 * Verified to derive the public key in `push-public.ts`. Kept in code so push
 * works on a deployment with no environment variables set.
 */
export const FALLBACK_VAPID_PRIVATE_KEY =
  "Ske5JxpE7re9ldNGoPHXAPuvVgYARDFy_Iz6njmn0w8";

export type WebPushConfig = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

/**
 * The VAPID private key: the environment variable when set, otherwise the
 * committed fallback.
 *
 * Trimmed because a trailing newline pasted into a dashboard is the single
 * most common way this variable arrives broken, and a key with a newline
 * fails to parse with a message that does not mention whitespace.
 */
function privateKey(): string | null {
  const key = process.env.VAPID_PRIVATE_KEY?.trim();
  return key ? key : FALLBACK_VAPID_PRIVATE_KEY;
}

/**
 * The VAPID triple, or null when no private key is available.
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
 * Throws when no private key is available. That is intentional: a push that
 * cannot be signed is a bug in the deployment, and it should surface as one
 * rather than as a notification that quietly never arrives.
 */
export function webPushConfig(): WebPushConfig {
  const config = webPushConfigOrNull();

  if (!config) {
    throw new Error(
      "No VAPID private key is available. Web Push cannot sign a notification without one. " +
        "Set VAPID_PRIVATE_KEY in the deployment environment, or restore the fallback in " +
        "src/lib/push-private.ts. It must be the private half of the public key in " +
        "src/lib/push-public.ts.",
    );
  }

  return config;
}
