/**
 * The VAPID public key, shared by the browser and the server.
 *
 * ── Why this is a literal, not an environment variable ──────────────────────
 * This is the ORIGINAL key pair the site has always used. It was moved to
 * `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` in a later change, and
 * that broke delivery: the deployment had no such variables set, so the server
 * reported itself "unconfigured" and every send was skipped, while the browser
 * subscribed with `undefined` as the application server key. Existing
 * subscribers kept their old subscription rows, bound to THIS key, and never
 * received anything again.
 *
 * The pair is therefore restored in code, exactly as it was before the move.
 * Both halves must stay together: a subscription is bound to the public key it
 * was created with, and the server can only sign for it with the matching
 * private key. Changing one without the other silently breaks every existing
 * subscriber.
 *
 * A VAPID public key is NOT a secret — it is handed to every browser that
 * subscribes, by design. It is also inlined into the client bundle either way.
 *
 * The private half lives in `push-private.ts` (server-only).
 */
export const VAPID_PUBLIC_KEY =
  "BH4KhHlwe6K-edmJnCgCddFa4Y0I5CzXOD-w7S3OzhoRXXoRYPeY4KNCY0kaiby_2TnqZOddzPEkozCyaDb5nG0";
