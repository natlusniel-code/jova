// NOTE: deliberately NOT `import "server-only"`. This module is imported by
// `src/middleware.ts`, which runs in the Edge runtime, and by the unit tests in
// plain Node. It holds no secrets — it only formats log lines — so the guard
// would add nothing but would break both of those environments.

import { cookieNames, maskEmail } from "./redact";

export { cookieNames, maskEmail };

/**
 * Structured, correlation-ID auth diagnostics.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * The redirect bug survived a whole identity-provider swap because every
 * stage of the sign-in chain failed *silently*: a swallowed cookie write, a
 * `catch {}` with no message, a `getUser()` that returned null and was treated
 * as "not signed in". Nothing in the logs connected the successful credential
 * check to the failed session, so the symptom looked like "the provider is
 * broken" when the provider was fine.
 *
 * Every stage of the chain now emits one line carrying the SAME `cid`, so a
 * single login attempt can be read end to end:
 *
 *   supabase.user.resolve → supabase.session.mint
 *   → supabase.session.verify → redirect.destination
 *   → middleware.session → page.session
 *
 * ── What is NEVER logged ─────────────────────────────────────────────────────
 * Passwords, Supabase access/refresh tokens, API keys,
 * service-role keys, and complete cookie values. Cookie NAMES are logged
 * (they are not secret and are what you need to debug a missing cookie);
 * cookie values are not. Emails are masked to `a***@domain`.
 */

export type AuthStage =
  | "clerk.verify"
  | "clerk.bridge"
  | "supabase.user.resolve"
  | "supabase.session.mint"
  | "supabase.session.verify"
  | "redirect.destination"
  | "middleware.session"
  | "page.session";

export type AuthOutcome = "ok" | "fail" | "skip";

/** A short, non-secret id that ties every line of one login attempt together. */
export function newCorrelationId(): string {
  // 12 hex chars is plenty to disambiguate concurrent attempts in a log view.
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

type Fields = Record<string, string | number | boolean | null | undefined>;

function emit(
  level: "info" | "warn" | "error",
  stage: AuthStage,
  outcome: AuthOutcome,
  cid: string,
  fields: Fields,
  error?: unknown,
) {
  const line: Record<string, unknown> = {
    tag: "auth",
    stage,
    outcome,
    cid,
    ...fields,
  };

  if (error !== undefined) {
    // Keep the message and the stack's first frame; never the whole object,
    // which can carry request headers (and therefore cookies/tokens).
    if (error instanceof Error) {
      line.error_name = error.name;
      line.error_message = error.message;
    } else {
      line.error_message = String(error);
    }
  }

  const text = JSON.stringify(line);
  if (level === "error") console.error(text);
  else if (level === "warn") console.warn(text);
  else console.log(text);
}

export function authOk(stage: AuthStage, cid: string, fields: Fields = {}) {
  emit("info", stage, "ok", cid, fields);
}

export function authSkip(stage: AuthStage, cid: string, fields: Fields = {}) {
  emit("info", stage, "skip", cid, fields);
}

export function authFail(
  stage: AuthStage,
  cid: string,
  fields: Fields = {},
  error?: unknown,
) {
  emit("error", stage, "fail", cid, fields, error);
}
