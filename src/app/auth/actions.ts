"use server";

import { redirect } from "next/navigation";
import { requestClient } from "@/lib/auth/local";
import {
  signInWithPassword,
  signUpWithPassword,
  type PasswordAuthResult,
} from "@/lib/auth/password";

/**
 * The email + password auth actions.
 *
 * These are thin wrappers: the work lives in `src/lib/auth/password.ts`, which
 * is the one place a session is established. Keeping the actions thin means
 * there is a single implementation to reason about, and the same functions can
 * be unit-tested without a Next.js request.
 */

export type ActionResult =
  | { ok: true; next?: string }
  | { ok: false; error: string; field?: string };

/** Sign in an existing Supabase account with its email and password. */
export async function signInAction(formData: FormData): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = formData.get("next") ? String(formData.get("next")) : null;

  const result: PasswordAuthResult = await signInWithPassword(email, password, next);
  return result.ok ? { ok: true, next: result.next } : result;
}

/** Create an account with an email and password, then sign it in. */
export async function signUpAction(formData: FormData): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("full_name") ?? "");
  const role = String(formData.get("role") ?? "buyer") === "seller" ? "seller" : "buyer";
  const next = formData.get("next") ? String(formData.get("next")) : null;

  const result: PasswordAuthResult = await signUpWithPassword({
    email,
    password,
    fullName,
    role,
    next,
  });
  return result.ok ? { ok: true, next: result.next } : result;
}

/**
 * Save the phone number and local government a buyer still needs.
 *
 * Kept from the previous flow: an email signup collects a name and an email,
 * but the marketplace also needs a phone (how a seller or support reaches them
 * about an order) and a state/LGA (which decides which sellers they can order
 * from). It writes through the request client, so RLS applies and the row can
 * only ever be the caller's own — the id is never taken from the form.
 */
export async function completeProfileAction(formData: FormData): Promise<ActionResult> {
  const fullName = String(formData.get("full_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").replace(/\s/g, "");
  const state = String(formData.get("state") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();

  if (fullName.length < 3) {
    return { ok: false, error: "Enter your full name.", field: "full_name" };
  }
  if (!/^0\d{10}$/.test(phone)) {
    return { ok: false, error: "Use 11 digits, like 08012345678.", field: "phone" };
  }
  if (!city) {
    return { ok: false, error: "Choose your local government.", field: "city" };
  }

  try {
    const supabase = requestClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { ok: false, error: "Your session expired. Please sign in again." };
    }

    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName, phone, state, city })
      .eq("id", user.id);
    if (error) {
      console.error("[auth] could not save profile details", error);
      return {
        ok: false,
        error: "We couldn't save your details just now. Please try again.",
      };
    }

    const { data: prof } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    return {
      ok: true,
      next: prof?.role === "seller" ? "/seller/onboarding?step=1" : "/",
    };
  } catch (e) {
    console.error("[auth] save profile details failed", e);
    return {
      ok: false,
      error: "We couldn't save your details just now. Please try again.",
    };
  }
}

/** Clear the Supabase session cookie and go home. */
export async function signOutAction(): Promise<void> {
  const supabase = requestClient();
  await supabase.auth.signOut();
  redirect("/");
}
