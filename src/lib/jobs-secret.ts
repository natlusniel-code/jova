import "server-only";

/**
 * The job-runner shared secret.
 *
 * ── Why there is no committed value ────────────────────────────────────────
 * This module used to carry a hardcoded fallback (`"nm-jobs-…"`) so the cron
 * endpoint worked with no configuration. That secret guards `/api/jobs/run`,
 * which advances order timers and flushes the notification outbox — knowing it
 * lets anyone drive those early. It has been removed and purged from history.
 *
 * `JOBS_SECRET` is now the only source. `jobsSecret()` throws when it is
 * missing, and the route answers `500` with a clear message — the same
 * behaviour the endpoint already documented for an unset variable.
 */

/**
 * The shared secret, or `null` when the server is not configured with one.
 *
 * Returns `null` rather than throwing so callers can decide; the route treats
 * `null` as "endpoint disabled".
 */
export function jobsSecretOrNull(): string | null {
  const secret = process.env.JOBS_SECRET?.trim() ?? "";
  return secret.length > 0 ? secret : null;
}

/**
 * The shared secret.
 *
 * Throws — it never substitutes a committed value. There is no such value any
 * more.
 */
export function jobsSecret(): string {
  const secret = jobsSecretOrNull();
  if (!secret) {
    throw new Error(
      "JOBS_SECRET is not set on this server, so /api/jobs/run is closed. " +
        "Set it in the deployment environment (never commit it).",
    );
  }
  return secret;
}
