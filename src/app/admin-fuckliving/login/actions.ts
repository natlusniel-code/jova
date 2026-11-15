"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { checkPassword, mintSession } from "@/lib/auth/local";

/**
 * Admin sign-in.
 *
 * ── Why a separate action and not `signInAction` ──────────────────────────
 * The normal sign-in decides where to land from the account's role: a seller
 * goes to the Seller Hub, a buyer to the storefront. An admin must land on the
 * console instead, and a non-admin who tries this page must be sent to the
 * normal home page rather than shown a 404 — the 404 is for the console
 * itself, not for the act of trying to sign in.
 *
 * ── Why Supabase Auth is still underneath ─────────────────────────────────
 * `checkPassword` verifies against `public.account_credentials`, and
 * `mintSession` mints the Supabase session cookie. The identity system is
 * unchanged; this action only adds the admin role check and the destination.
 *
 * ── Why the role check is a query ─────────────────────────────────────────
 * `admin_users` is the same table `is_admin()` reads, so the page, the
 * middleware and the Server Actions all agree on one definition of "admin".
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

export async function adminSignInAction(formData: FormData): Promise<AdminLoginResult> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(String(formData.get("next") ?? ""));

  if (!email) return { ok: false, error: "Enter your email address." };
  if (!password) return { ok: false, error: "Enter your password." };

  let userId: string;
  let resolvedEmail = email;

  try {
    const verdict = await checkPassword(email, password);
    if (!verdict.ok) {
      // Deliberately the same sentence for every failure: an admin login page
      // must not tell an attacker whether the address exists.
      return { ok: false, error: "That email and password don't match." };
    }
    userId = verdict.userId;
    resolvedEmail = verdict.email;
  } catch {
    return { ok: false, error: "We couldn't sign you in. Please try again." };
  }

  // Establish the session first, so the role query below runs as this user.
  try {
    await mintSession(resolvedEmail);
  } catch {
    return { ok: false, error: "We couldn't sign you in. Please try again." };
  }

  // Is this account an admin? The row is the truth.
  let isAdmin = false;
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("admin_users")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    isAdmin = Boolean(data);
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
