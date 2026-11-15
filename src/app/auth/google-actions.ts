"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { mintSession } from "@/lib/auth/local";
import { postAuthDestination } from "@/lib/post-auth";
import { requestClient } from "@/lib/auth/local";
import {
  findOrCreateSupabaseUser,
  NoAccountError,
  verifyAppwriteJwt,
} from "@/lib/appwrite/server";

/**
 * Bridge an Appwrite (Google) sign-in into a Supabase session.
 *
 * ── The flow ────────────────────────────────────────────────────────────────
 *  1. The browser finishes the Appwrite OAuth2 token flow and holds a real
 *     Appwrite session.
 *  2. It calls this action with its Appwrite user id and a short-lived JWT.
 *  3. We ask Appwrite who the JWT belongs to. If that does not match the
 *     claimed id, we refuse — otherwise this endpoint would let anyone mint a
 *     session for any account.
 *  4. We find or create the matching Supabase user by email.
 *  5. We mint a Supabase session cookie for it, exactly as the password flow
 *     does, so the whole marketplace works unchanged.
 *
 * Returns the destination to navigate to, decided by the same role rules the
 * password sign-in uses (a seller lands in the Seller Hub, a buyer on the
 * storefront).
 */

export type GoogleBridgeResult =
  | { ok: true; next: string }
  | { ok: false; error: string; noAccount?: boolean };

export async function bridgeGoogleSession(input: {
  userId: string;
  jwt: string;
  mode?: "signin" | "signup";
  role?: "buyer" | "seller";
  next?: string | null;
}): Promise<GoogleBridgeResult> {
  const claimedId = String(input?.userId ?? "").trim();
  const jwt = String(input?.jwt ?? "").trim();
  const mode = input?.mode === "signup" ? "signup" : "signin";
  const role = input?.role === "seller" ? "seller" : "buyer";

  // Only a same-origin relative path — never an absolute URL.
  const rawNext = String(input?.next ?? "");
  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : null;

  if (!claimedId || !jwt) {
    return { ok: false, error: "The sign-in did not complete. Please try again." };
  }

  // ── 1. Verify the JWT really belongs to the claimed user ─────────────────
  const appwriteUser = await verifyAppwriteJwt(jwt);
  if (!appwriteUser) {
    return {
      ok: false,
      error: "We could not verify your Google sign-in. Please try again.",
    };
  }
  if (appwriteUser.$id !== claimedId) {
    return {
      ok: false,
      error: "We could not verify your Google sign-in. Please try again.",
    };
  }

  // ── 2. Find or create the Supabase account ───────────────────────────────
  // With email sign-up removed, Google is the ONLY way to create an account,
  // so creation is always allowed. There is no longer a "the login page must
  // not create accounts" rule to enforce, because there is no separate login
  // page: `/auth` is both doors at once.
  //
  // The important half is the LOOKUP, not the create. `findOrCreateSupabaseUser`
  // matches on email, so someone who signed up with a password before Google
  // was added — and whose address is the same as their Google account — is
  // handed back their EXISTING Supabase user id. Same profile, same role, same
  // orders and chats. No duplicate account is created.
  let resolved: { userId: string; email: string; created: boolean } | null;
  try {
    resolved = await findOrCreateSupabaseUser(appwriteUser, {
      allowCreate: true,
      role,
    });
  } catch (e) {
    if (e instanceof NoAccountError) {
      return { ok: false, error: e.message, noAccount: true };
    }
    return {
      ok: false,
      error:
        e instanceof Error
          ? e.message
          : "We could not set up your account. Please try again.",
    };
  }

  if (!resolved) {
    return {
      ok: false,
      error:
        "Your Google account did not share an email address, so we cannot create a NaijaMart account. Try a different Google account.",
    };
  }

  // ── 3. Mint the Supabase session cookie ──────────────────────────────────
  try {
    await mintSession(resolved.email);
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error
          ? e.message
          : "We could not start your session. Please try again.",
    };
  }

  // ── 4. Where to land ─────────────────────────────────────────────────────
  // A brand-new Google signup has not given us a phone number or an LGA yet,
  // and a seller has a whole onboarding flow to finish. Both must be sent to
  // the step that collects what is missing — never straight to a dashboard.
  if (resolved.created) {
    if (role === "seller") {
      // Verification → shop creation → plan payment → approval. The seller
      // hub is gated on an approved shop, so this is the only correct entry.
      return { ok: true, next: "/seller/onboarding?step=1" };
    }
    // Buyer: collect the local government and phone number before anything
    // else. `next` carries them to the storefront afterwards.
    return { ok: true, next: "/signup/complete" };
  }

  // An existing account follows the same role rules the marketplace already
  // uses, with the requested page winning when there is one. The database
  // decides the role, not the client.
  let destination = "/dashboard";
  try {
    const supabase = requestClient();
    destination = await postAuthDestination(supabase, resolved.userId, next);
  } catch {
    destination = next ?? "/dashboard";
  }

  return { ok: true, next: destination };
}

/**
 * Sign out of BOTH systems.
 *
 * The Appwrite session is deleted in the browser (the Web SDK owns it); this
 * action clears the Supabase cookie, which is what the marketplace actually
 * reads. Doing only one would leave the user half signed in — still able to
 * load seller pages, or still holding an Appwrite session they cannot see.
 */
export async function signOutEverywhere(): Promise<void> {
  try {
    const supabase = requestClient();
    await supabase.auth.signOut();
  } catch {
    // No session to clear. The redirect still happens.
  }
}

/** True when the admin key is present, so the bridge can actually run. */
export async function bridgeConfigured(): Promise<boolean> {
  try {
    createAdminClient();
    return true;
  } catch {
    return false;
  }
}
