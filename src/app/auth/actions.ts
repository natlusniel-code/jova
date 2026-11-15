"use server";

import { redirect } from "next/navigation";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/config";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  accountHasPhone,
  checkPassword,
  createAccountUser,
  emailTaken,
  issueCode,
  mintSession,
  phoneMatches,
  requestClient,
  setPassword,
  verifyCode,
} from "@/lib/auth/local";
import { postAuthDestination } from "@/lib/post-auth";
import { sendVerificationEmail, isEmailVerified } from "@/lib/email/verify";

/**
 * Every sign-in, sign-up and reset action for the site.
 *
 * All of them are Server Actions, so the password travels from the form to
 * this file over TLS and is never held in browser state, never put in a URL,
 * and never logged. The browser only ever receives a short result object.
 */

export type ActionResult =
  | { ok: true; next?: string; code?: string; email?: string }
  | { ok: false; error: string; field?: string; code?: string; attemptsLeft?: number; email?: string };

/** Only same-origin relative paths — never an absolute URL. */
function safeNext(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}

function friendly(error: string): string {
  switch (error) {
    case "invalid":
      return "That email and password don't match. Check the password, or reset it below.";
    case "locked":
      return "Too many wrong attempts. Wait a few minutes, then try again.";
    case "banned":
      return "This account has been suspended. Contact support if you think that's a mistake.";
    default:
      return "We couldn't sign you in. Please try again.";
  }
}

/**
 * One-time migration for accounts that predate `account_credentials`.
 *
 * Those rows were backfilled with a hash that matches nothing, so `nm_login`
 * reports `no_credentials`. Rather than force every existing user through a
 * password reset, we ask Supabase once whether the password they just typed is
 * the one it has on file. If it is, we copy it into our own store and carry on
 * — the user notices nothing, and from then on their password is checked by us.
 *
 * This is the ONLY place Supabase still verifies a password, and it stops
 * being reachable for an account the moment that account has a real hash.
 */
async function migrateLegacyPassword(
  email: string,
  password: string,
): Promise<{ userId: string; email: string } | null> {
  const legacy = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await legacy.auth.signInWithPassword({ email, password });
  if (error || !data.user?.email) return null;

  await setPassword(data.user.id, data.user.email, password);
  return { userId: data.user.id, email: data.user.email };
}

// ───────────────────────────────────────────────────────────────────────
// sign in
// ───────────────────────────────────────────────────────────────────────
export async function signInAction(formData: FormData): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(String(formData.get("next") ?? ""));

  if (!email) return { ok: false, error: "Enter your email address.", field: "email" };
  if (!password) return { ok: false, error: "Enter your password.", field: "password" };

  let userId: string;
  let resolvedEmail = email;

  try {
    const verdict = await checkPassword(email, password);

    if (verdict.ok) {
      userId = verdict.userId;
      resolvedEmail = verdict.email;
    } else if (verdict.error === "no_credentials") {
      const migrated = await migrateLegacyPassword(email, password);
      if (!migrated) {
        return { ok: false, error: friendly("invalid") };
      }
      userId = migrated.userId;
      resolvedEmail = migrated.email;
    } else {
      return { ok: false, error: friendly(verdict.error) };
    }

    // ── The password is right — but is the address confirmed? ──────────────
    // Checked AFTER the password, never before. Doing it first would let
    // anyone discover which addresses have accounts by watching for the
    // "not verified" message on a wrong password.
    //
    // Accounts created before this change were backfilled as verified in
    // sql/0044, so this only ever catches a genuinely new, unconfirmed signup.
    if (!(await isEmailVerified(resolvedEmail))) {
      return {
        ok: false,
        error:
          "Please confirm your email address first. We have sent you a link — open it, then sign in.",
        field: "email",
        email: resolvedEmail,
      };
    }

    await mintSession(resolvedEmail);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "We couldn't sign you in." };
  }

  // Where to land is decided from the database, not from the form: a seller
  // goes to the Seller Hub (or onboarding), a buyer to the storefront.
  let destination = "/";
  try {
    const supabase = requestClient();
    destination = await postAuthDestination(supabase, userId, next);
  } catch {
    destination = next ?? "/";
  }

  return { ok: true, next: destination };
}

// ───────────────────────────────────────────────────────────────────────
// sign up — step 1: create the account and show a code
// ───────────────────────────────────────────────────────────────────────
export async function startSignupAction(formData: FormData): Promise<ActionResult> {
  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").replace(/\s/g, "");
  const password = String(formData.get("password") ?? "");
  const state = String(formData.get("state") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const role = String(formData.get("role") ?? "buyer") === "seller" ? "seller" : "buyer";

  if (fullName.length < 3) return { ok: false, error: "Enter your full name.", field: "full_name" };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email))
    return { ok: false, error: "Enter a valid email address.", field: "email" };
  if (!/^0\d{10}$/.test(phone))
    return { ok: false, error: "Use 11 digits, like 08012345678.", field: "phone" };
  if (password.length < 8)
    return { ok: false, error: "Use at least 8 characters.", field: "password" };

  try {
    if (await emailTaken(email)) {
      return { ok: false, error: "That email is already registered. Try signing in.", field: "email" };
    }

    const userId = await createAccountUser({ email, fullName, phone, state, city, role });
    await setPassword(userId, email, password);

    // ── Email the verification link ────────────────────────────────────────
    // The old flow generated a code and returned it to the form, which showed
    // it on screen. That proved nothing — whoever was at the keyboard could
    // read it. The link goes to the address itself, so only someone with
    // access to the inbox can confirm the account.
    //
    // If the mail cannot be sent we say so plainly. Letting the person sit on
    // a "check your email" screen for a message that never left would be the
    // worst outcome, so the account is still created (they can request a new
    // link from sign-in) but the error is surfaced.
    const sent = await sendVerificationEmail({
      email,
      firstName: fullName.split(" ")[0] ?? fullName,
      role,
    });

    if (!sent.ok) {
      return {
        ok: false,
        error: sent.error,
        field: "email",
        email,
      };
    }

    return { ok: true, email };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "We couldn't create your account." };
  }
}

// ───────────────────────────────────────────────────────────────────────
// sign up — step 2: the person opens the link in their email
// ───────────────────────────────────────────────────────────────────────
/**
 * Send a fresh verification link.
 *
 * The old `verifySignupAction` / `resendSignupCodeAction` pair is gone: there
 * is no code to retype any more, so there is nothing for the browser to check.
 * Confirmation happens on `/auth/verify` when the link is opened, and this
 * action only re-sends it.
 *
 * It deliberately does not reveal whether the address has an account — the
 * reply is the same either way, so the form cannot be used to enumerate users.
 */
export async function resendVerificationAction(
  formData: FormData,
): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "buyer") === "seller" ? "seller" : "buyer";

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) {
    return { ok: false, error: "Enter a valid email address.", field: "email" };
  }

  try {
    // Already confirmed? Nothing to resend — send them to sign in instead.
    if (await isEmailVerified(email)) {
      return { ok: true, next: "/signin" };
    }

    const sent = await sendVerificationEmail({
      email,
      firstName: email.split("@")[0],
      role,
    });
    if (!sent.ok) return { ok: false, error: sent.error };

    return { ok: true, email };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "We couldn't send a new link.",
    };
  }
}

// ───────────────────────────────────────────────────────────────────────
// password reset — no email, so the phone number on the account is the
// second factor. Two recorded details, not one.
// ───────────────────────────────────────────────────────────────────────
export async function startResetAction(formData: FormData): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").replace(/\s/g, "");

  if (!email) return { ok: false, error: "Enter your email address.", field: "email" };

  try {
    if (!(await emailTaken(email))) {
      // Same message as a wrong phone, so this form cannot be used to discover
      // which addresses have accounts.
      return {
        ok: false,
        error: "That email and phone number don't match an account.",
        field: "email",
      };
    }

    // The phone number is the only real check here: the code is displayed on
    // screen, so it proves nothing on its own. But it must never lock out a
    // legitimate user, so it is only enforced when the account actually has a
    // phone on record. An account with no phone falls through to the code.
    const hasPhone = await phoneMatches(email, phone);
    if (!hasPhone && phone) {
      return {
        ok: false,
        error: "That email and phone number don't match an account.",
        field: "phone",
      };
    }
    if (!hasPhone && !phone) {
      const recorded = await accountHasPhone(email);
      if (recorded) {
        return {
          ok: false,
          error: "Enter the phone number on your account.",
          field: "phone",
        };
      }
    }

    const code = await issueCode(email, "reset");
    return { ok: true, code, email };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "We couldn't start a reset." };
  }
}

export async function finishResetAction(formData: FormData): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const code = String(formData.get("code") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!/^\d{6}$/.test(code)) {
    return { ok: false, error: "Enter the 6-digit code shown above.", field: "code" };
  }
  if (password.length < 8) {
    return { ok: false, error: "Use at least 8 characters.", field: "password" };
  }

  try {
    const verdict = await verifyCode(email, code, "reset");
    if (!verdict.ok) {
      if (verdict.error === "mismatch") {
        return {
          ok: false,
          error: "That code doesn't match. Here's a new one — type it in.",
          code: verdict.rotatedCode,
          attemptsLeft: verdict.attemptsLeft,
        };
      }
      return { ok: false, error: "That code is no longer valid. Start the reset again." };
    }

    const admin = createAdminClient();
    const { data: prof } = await admin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (!prof?.id) return { ok: false, error: "We couldn't find that account." };

    await setPassword(prof.id, email, password);
    await mintSession(email);

    return { ok: true, next: "/" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "We couldn't reset your password." };
  }
}

// ───────────────────────────────────────────────────────────────────────
// sign out
// ───────────────────────────────────────────────────────────────────────
// ───────────────────────────────────────────────────────────────────────
// Google signup — the buyer's last step
// ───────────────────────────────────────────────────────────────────────
/**
 * Save the phone number and local government a Google buyer still needs.
 *
 * Google gives us a name and a verified email and nothing else. This writes
 * the two fields the marketplace actually depends on: the phone (the
 * password-reset factor) and the state/LGA (which decides which sellers the
 * buyer can order from).
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
    if (error) return { ok: false, error: error.message };

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
    return {
      ok: false,
      error: e instanceof Error ? e.message : "We couldn't save your details.",
    };
  }
}

export async function signOutAction(): Promise<void> {
  const supabase = requestClient();
  await supabase.auth.signOut();
  redirect("/");
}
