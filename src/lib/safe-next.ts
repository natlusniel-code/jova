/**
 * One place that decides whether a `?next=` value is safe to redirect to.
 *
 * ── Why this is a module and not a one-liner ────────────────────────────────
 * The same check was copy-pasted into six files, and every copy was slightly
 * different. That is how an open redirect gets in: one of the copies forgets a
 * case. So the rule lives here once and every caller imports it.
 *
 * ── What is rejected ────────────────────────────────────────────────────────
 *   • anything that is not a string, or is empty
 *   • an absolute URL (`https://evil.com`, `javascript:alert(1)`)
 *   • a protocol-relative URL (`//evil.com`) — the browser treats it as
 *     absolute even though it starts with a slash
 *   • a backslash form (`/\evil.com`, `\\evil.com`) — browsers normalise `\`
 *     to `/`, so `/\evil.com` becomes `//evil.com` and leaves the site
 *   • control characters and whitespace, which some parsers strip, turning a
 *     "safe" string into a different one after validation
 *   • a path that points back at the auth pages — following it would bounce
 *     the person straight back to the form they just left, which is the
 *     redirect loop this whole change exists to remove
 *
 * Returns the path when it is safe, otherwise `null`. Callers treat `null` as
 * "no preference" and fall back to the role-based destination.
 */

/** Paths that must never be a post-auth destination. */
const AUTH_PATHS = ["/auth", "/signin", "/signup", "/login"];

export function safeNextPath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;

  const value = raw.trim();
  if (!value) return null;

  // Must be a site-relative path.
  if (!value.startsWith("/")) return null;

  // `//host` and `/\host` both leave the site once the browser normalises them.
  if (value.startsWith("//") || value.startsWith("/\\")) return null;

  // A backslash anywhere is a normalisation hazard; a control character or a
  // newline can be stripped by a proxy and change the meaning of the URL.
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return null;

  // Strip the query/hash before comparing against the auth paths, so
  // `/auth?next=/x` is caught as well as `/auth`.
  const pathOnly = value.split(/[?#]/)[0].replace(/\/+$/, "") || "/";

  for (const blocked of AUTH_PATHS) {
    if (pathOnly === blocked || pathOnly.startsWith(`${blocked}/`)) return null;
  }

  return value;
}
