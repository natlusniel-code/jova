"use server";

import { redirect } from "next/navigation";
import { requestClient } from "@/lib/auth/local";

/**
 * The remaining auth actions.
 *
 * ── What used to be here ────────────────────────────────────────────────────
 * `signInAction`, `startSignupAction`, `startResetAction` and
 * `finishResetAction` — the whole email + password surface: password checks
 * against `account_credentials`, the legacy-password migration, the
 * "confirm your email" gate, and the phone-based password reset.
 *
 * All of it is gone. Google is the only way in, so there is no password to
 * check, no account to create from a form, and no password to reset. The
 * Appwrite OTP flow that briefly replaced the mailer is gone with it: no
 * `createEmailToken`, no 6-digit code, no verification screen.
 *
 * What is left is the two things that are still real:
 *   • `completeGoogleProfileAction` — the buyer's last step after Google,
 *     which collects the phone number and LGA that Google does not provide;
 *   • `signOutAction` — clearing the Supabase cookie.
 */

export type ActionResult =
  | { ok: true; next?: string }
  | { ok: false; error: string; field?: string };

/**
 * Save the phone number and local government a Google buyer still needs.
 *
 * Google gives us a name and a verified email and nothing else. This writes
 * the two fields the marketplace actually depends on: the phone (how a seller
 * or support reaches them about an order) and the state/LGA (which decides
 * which sellers the buyer can order from).
 *
 * It writes to `profiles` through the request client, so RLS applies and the
 * row can only be the caller's own — the id is never taken from the form.
 */
export async function completeGoogleProfileAction(
  formData: FormData,
): Promise<ActionResult> {
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
      console.error("[auth] could not save Google profile details", error);
      return {
        ok: false,
        error: "We couldn't save your details just now. Please try again.",
      };
    }

    // A buyer goes to the storefront. A seller who somehow reached this page
    // still has onboarding to finish, so they are sent there instead.
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
    console.error("[auth] save Google profile details failed", e);
    return {
      ok: false,
      error: "We couldn't save your details just now. Please try again.",
    };
  }
}

/**
 * Clear the Supabase session cookie and go home.
 *
 * The Appwrite session is cleared separately in the browser by
 * `signOutOfAppwrite()` — see `src/components/sign-out-button.tsx`, which is
 * the only sign-out control now that the password flow is gone.
 */
export async function signOutAction(): Promise<void> {
  const supabase = requestClient();
  await supabase.auth.signOut();
  redirect("/");
}
