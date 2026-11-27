"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { bridgeClerkSession } from "@/lib/clerk/bridge";

/**
 * Admin sign-in.
 *
 * ── Why a separate action and not `signInAction` ────────────────────────────
 * The normal sign-in decides where to land from the account's role: a seller
 * goes to the Seller Hub, a buyer to the storefront. An admin must land on the
 * console instead, and a non-admin who tries this page must be sent to the
 * normal home page rather than shown a 404 — the 404 is for the console
 * itself, not for the act of trying to sign in.
 *
 * ── Why Clerk is underneath now ─────────────────────────────────────────────
 * The console used to verify a password against `public.account_credentials`
 * via `nm_login`. That was a SECOND credential store: a staff member had a
 * Jova password that Clerk knew nothing about, so a password change in one
 * place left the other stale, and the console was the one door that bypassed
 * the identity provider entirely.
 *
 * Now the credential check is Clerk's, exactly like the public sign-in, and
 * this action only adds the admin role check and the destination. There is one
 * credential store and one place a session is minted.
 *
 * ── Why the role check is a query ───────────────────────────────────────────
 * `admin_users` is the same table `is_admin()` reads, so the page, the
 * middleware and the Server Actions all agree on one definition of "admin".
 * A claim in the token could be stale after a demotion, and `user_metadata` is
 * client-writable; the row is the truth.
 */

export type AdminLoginResult = { ok: false; error: string } | { ok: true; next: string };

/** Only same-origin relative paths — never an absolute URL. */
function safeNext(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  // Never bounce back into the login page itself.
  if (value.startsWith("/admin-fuckliving/login")) return null;
  return value;
}

/**
 * Finish an admin sign-in that Clerk has already completed in the browser.
 *
 * The form no longer posts an email and a password: Clerk's component collects
 * them, so this action receives only the `next` hint. It runs the same bridge
 * as the public sign-in — one implementation, one session-minting path — and
 * then decides whether the resulting account may enter the console.
 */
export async function adminSignInAction(formData: FormData): Promise<AdminLoginResult> {
  const next = safeNext(String(formData.get("next") ?? ""));

  const bridged = await bridgeClerkSession({ mode: "signin", next: null });
  if (!bridged.ok) {
    // Deliberately the same sentence for every failure: an admin login page
    // must not tell an attacker whether the address exists or is staff.
    return { ok: false, error: "That account can't sign in here." };
  }

  // Is this account an admin? The row is the truth.
  let isAdmin = false;
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from("admin_users")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();
      isAdmin = Boolean(data);
    }
  } catch {
    isAdmin = false;
  }

  // A non-admin who signed in here is a normal user who used the wrong door.
  // Send them home — not to a 404, and not into the console.
  if (!isAdmin) return { ok: true, next: "/" };

  return { ok: true, next: next ?? "/admin-fuckliving" };
}

/** Sign out of the admin console and return to the admin login page. */
export async function adminSignOutAction(): Promise<void> {
  const supabase = createClient();
  try {
    await supabase.auth.signOut();
  } catch {
    /* the cookie is cleared by the redirect either way */
  }
  redirect("/admin-fuckliving/login");
}
