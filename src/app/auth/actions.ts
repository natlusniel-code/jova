"use server";

import { redirect } from "next/navigation";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { requestClient } from "@/lib/auth/local";
import { bridgeClerkSession, type ClerkBridgeResult } from "@/lib/clerk/bridge";

/**
 * The auth actions.
 *
 * ── What changed ─────────────────────────────────────────────────────────────
 * Clerk now owns the credential check. There is no password to verify here and
 * no account to create here: the browser completes the Clerk sign-in (its own
 * component, its own cookie), and these actions do the ONE thing Clerk cannot
 * do — mint the Supabase session that every RLS policy depends on.
 *
 * `signInAction` / `signUpAction` are therefore thin wrappers over
 * `bridgeClerkSession`, which is the single place a session is established.
 * Keeping them thin means there is one implementation to reason about, and the
 * same function can be unit-tested without a Next.js request.
 *
 * ── What was removed ────────────────────────────────────────────────────────
 * `signInWithPassword` / `signUpWithPassword` (src/lib/auth/password.ts) and
 * the WhatsApp OTP route both wrote credentials into Jova's own store. Clerk is
 * the credential store now, so both are gone rather than left as dead code that
 * still looks callable.
 */

export type ActionResult =
  | { ok: true; next?: string }
  | { ok: false; error: string; field?: string };

/**
 * Finish a sign-in that Clerk has already completed in the browser.
 *
 * The caller must have an active Clerk session; if it does not, the bridge
 * returns a real error instead of redirecting, so the form can show it.
 */
export async function signInAction(formData: FormData): Promise<ActionResult> {
  const next = formData.get("next") ? String(formData.get("next")) : null;

  const result: ClerkBridgeResult = await bridgeClerkSession({
    mode: "signin",
    next,
  });

  return result.ok ? { ok: true, next: result.next } : result;
}

/**
 * Finish a sign-up that Clerk has already completed in the browser.
 *
 * `role` is the buyer/seller choice from step one of `/signup`. It is written
 * to `public.profiles` by the bridge, because the role is a marketplace fact,
 * not an identity fact — Clerk has no business knowing it.
 */
export async function signUpAction(formData: FormData): Promise<ActionResult> {
  const role = String(formData.get("role") ?? "buyer") === "seller" ? "seller" : "buyer";
  const next = formData.get("next") ? String(formData.get("next")) : null;

  const result: ClerkBridgeResult = await bridgeClerkSession({
    mode: "signup",
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

/**
 * Sign out of BOTH sessions.
 *
 * There are two now, and they must be cleared together: the Supabase session
 * (which every query uses) and the Clerk session (which is the identity). If
 * only one is cleared the person appears signed out but still holds a valid
 * identity, and the next page load silently re-mints a Supabase session for
 * them — the exact "sign out did nothing" bug.
 */
export async function signOutAction(): Promise<void> {
  const supabase = requestClient();
  try {
    await supabase.auth.signOut();
  } catch {
    /* the cookie is cleared by the redirect either way */
  }

  try {
    const { userId } = await auth();
    if (userId) {
      const client = await clerkClient();
      // Revoke the Clerk session server-side, not just the browser cookie.
      await client.sessions.revokeSession(
        (await auth()).sessionId as string,
      );
    }
  } catch {
    /* Clerk's own sign-out in the client component clears its cookie */
  }

  redirect("/");
}
