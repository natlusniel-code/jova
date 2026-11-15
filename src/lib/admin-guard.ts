import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * The admin check for Server Actions.
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 * The console's pages are gated by middleware, but a Server Action is its own
 * HTTP endpoint: it can be invoked directly, without ever rendering the page
 * that contains the button. Gating only the page therefore protects the view
 * and not the mutation — and the mutations here verify payments, release
 * payouts, ban buyers and change settings.
 *
 * So every exported action calls this first. It is the same `admin_users` row
 * that `is_admin()` reads and that the middleware checks, so there is one
 * definition of "admin" in the whole app.
 *
 * ── Why it uses the anon client ───────────────────────────────────────────
 * The action then writes with the service-role client, which bypasses RLS and
 * therefore cannot tell us who is calling. The identity has to come from the
 * session cookie, and the anon client is the one that carries it. The
 * `admin_users_self` policy lets a signed-in user read their own row, which
 * is exactly the query below.
 */
export type AdminCheck = { ok: true; userId: string } | { ok: false; error: string };

export async function requireAdmin(): Promise<AdminCheck> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { ok: false, error: "Sign in as an admin to do that." };

    const { data: adminRow } = await supabase
      .from("admin_users")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!adminRow) return { ok: false, error: "Admins only." };

    return { ok: true, userId: user.id };
  } catch {
    // Fail closed. A guard that fails open is not a guard.
    return { ok: false, error: "Could not verify your admin access. Please sign in again." };
  }
}
