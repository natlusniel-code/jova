import "server-only";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

/**
 * Server-only Supabase client for the admin console.
 *
 * ── The key is READ, never committed ───────────────────────────────────────
 * This module previously carried a hardcoded `FALLBACK_SERVICE_ROLE_KEY` so the
 * console "worked with zero configuration". That is a leaked credential by
 * definition: it sat in git history and gave anyone who read it full read/write
 * access to every buyer's orders, addresses and payout details, plus the
 * ability to write to the database as an admin.
 *
 * It has been removed. `SUPABASE_SERVICE_ROLE_KEY` is now the ONLY source. If
 * it is missing there is no fallback to a committed value — the failure is
 * explicit (see `serviceRoleKey()` and `createAdminClient()`), because a key
 * that is not in the repository cannot leak from it.
 *
 * Set the variable in the deployment environment (Vercel → Project Settings →
 * Environment Variables, for Production and Preview). See README §1d.
 *
 * ── The rules that keep the key server-side ────────────────────────────────
 *  1. The key is a NON-public value. Next.js only inlines `NEXT_PUBLIC_*` into
 *     the browser bundle, so this module must never be imported from a Client
 *     Component. The build enforces this too: the `server-only` import below
 *     turns any accidental client-side import into a compile error rather than
 *     a leaked key.
 *  2. Every mutation goes through a Server Action in `src/app/admin-fuckliving/`,
 *     which runs on the server. The browser never sees the key and never calls
 *     Supabase directly for admin work.
 *  3. It degrades loudly, not silently: `hasAdminKey` is false without the
 *     variable, the layout shows the amber "not configured" banner, and every
 *     action returns a clear error instead of pretending to have written.
 */

const MISSING_KEY =
  "SUPABASE_SERVICE_ROLE_KEY is not set on this server. Admin writes are disabled. " +
  "Set it in the deployment environment (never commit it) — see README §1d.";

/** The resolved service-role key, or `""` when the environment is missing it. */
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";

/** True when the admin console can actually reach the database. */
export const hasAdminKey = SERVICE_ROLE_KEY.length > 0;

/**
 * The resolved service-role key.
 *
 * Throws when the variable is missing rather than returning a committed
 * fallback. Exported for the one caller that needs raw REST rather than the
 * supabase-js query builder: the copilot's schema introspection, which reads
 * PostgREST's OpenAPI root to learn what tables and columns exist right now.
 * Server-only, like everything else in this module.
 */
export function serviceRoleKey(): string {
  if (!hasAdminKey) throw new Error(MISSING_KEY);
  return SERVICE_ROLE_KEY;
}

/**
 * Service-role client: bypasses RLS. Server-side only — never pass this to a
 * Client Component, never serialise it, never read it from the browser.
 *
 * Throws when `SUPABASE_SERVICE_ROLE_KEY` is missing. It does NOT quietly fall
 * back to the ANON key: an anon client silently returns zero rows for every
 * admin query (RLS blocks them), which reads as "no orders yet" and hides the
 * misconfiguration. A thrown error surfaces as an error the operator can see
 * and fix, which is the whole point of dropping the committed fallback.
 *
 * `persistSession: false` + `autoRefreshToken: false` because this client has no
 * user to persist a session for; it authenticates as the key itself.
 */
export function createAdminClient() {
  if (!hasAdminKey) throw new Error(MISSING_KEY);

  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * The anon client, for the one admin path that legitimately wants RLS rather
 * than a bypass: reading the `admin_users` row of the signed-in user.
 *
 * It needs no secret — the anon key is public by design.
 */
export function createAnonClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
