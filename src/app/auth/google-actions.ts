"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { mintSession } from "@/lib/auth/local";
import { postAuthDestination } from "@/lib/post-auth";
import { requestClient } from "@/lib/auth/local";
import { findOrCreateSupabaseUser, verifyAppwriteJwt } from "@/lib/appwrite/server";

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
  | { ok: false; error: string };

export async function bridgeGoogleSession(input: {
  userId: string;
  jwt: string;
}): Promise<GoogleBridgeResult> {
  const claimedId = String(input?.userId ?? "").trim();
  const jwt = String(input?.jwt ?? "").trim();

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
  let resolved: { userId: string; email: string; created: boolean } | null;
  try {
    resolved = await findOrCreateSupabaseUser(appwriteUser);
  } catch (e) {
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
  // Same rule as the password flow: the database decides, not the client.
  let destination = "/dashboard";
  try {
    const supabase = requestClient();
    destination = await postAuthDestination(supabase, resolved.userId, null);
  } catch {
    destination = "/dashboard";
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
