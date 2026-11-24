/**
 * Pure redaction helpers for auth diagnostics.
 *
 * Deliberately free of `server-only` so they can be unit-tested in plain Node.
 * They contain no secrets and no I/O — they only decide what is safe to print.
 */

/** `ada@example.com` → `a***@example.com`. Never log a full address. */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return "(none)";
  const at = email.lastIndexOf("@");
  if (at <= 0) return "***";
  return `${email[0]}***${email.slice(at)}`;
}

/**
 * Cookie names only — never values.
 *
 * A Supabase session is chunked across `sb-<ref>-auth-token.0`, `.1`, … so the
 * *set* of names is the useful signal: if `.0` is present but `.1` is missing,
 * the token was truncated; if none are present, the write never reached the
 * browser.
 */
export function cookieNames(cookies: { name: string }[]): string[] {
  return cookies.map((c) => c.name).sort();
}
