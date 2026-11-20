"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { mintSession, requestClient } from "@/lib/auth/local";
import { postAuthDestination } from "@/lib/post-auth";
import {
  findOrCreateSupabaseUser,
  NoAccountError,
  type ClerkIdentity,
} from "@/lib/clerk/bridge";

/**
 * Bridge a Clerk sign-in into a Supabase session.
 *
 * ── The flow ────────────────────────────────────────────────────────────────
 *  1. The browser finishes the Clerk flow (OAuth redirect, or email code) and
 *     holds a real Clerk session.
 *  2. It calls this action.
 *  3. We read the identity from the Clerk session ON THE SERVER — `auth()` and
 *     `currentUser()` verify the session cookie. The browser never sends a user
 *     id, so there is nothing to forge: this endpoint cannot be used to mint a
 *     session for an account the caller does not own.
 *  4. We find or create the matching Supabase user by email.
 *  5. We mint a Supabase session cookie for it, exactly as the old flow did, so
 *     the whole marketplace works unchanged.
 *
 * Returns the destination to navigate to, decided by the same role rules the
 * marketplace already uses (a seller lands in the Seller Hub, a buyer on the
 * storefront).
 */

export type BridgeResult =
  | { ok: true; next: string }
  | { ok: false; error: string; noAccount?: boolean; existing?: boolean };

export async function bridgeClerkSession(input: {
  mode?: "signin" | "signup";
  role?: "buyer" | "seller";
  next?: string | null;
}): Promise<BridgeResult> {
  const mode = input?.mode === "signup" ? "signup" : "signin";
  const role = input?.role === "seller" ? "seller" : "buyer";

  // Only a same-origin relative path — never an absolute URL.
  const rawNext = String(input?.next ?? "");
  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : null;

  // ── 1. Read the verified identity from the Clerk session ───────────────────
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    return {
      ok: false,
      error: "Your sign-in did not complete. Please try again.",
    };
  }

  const user = await currentUser();
  if (!user) {
    return {
      ok: false,
      error: "Your sign-in did not complete. Please try again.",
    };
  }

  // Prefer the primary address; fall back to the first verified one. An
  // unverified address is never used as a join key — that would let someone
  // claim an account by typing its email.
  const primary = user.emailAddresses.find(
    (e) => e.id === user.primaryEmailAddressId,
  );
  const verified =
    primary && primary.verification?.status === "verified"
      ? primary
      : user.emailAddresses.find((e) => e.verification?.status === "verified");

  const identity: ClerkIdentity = {
    clerkUserId,
    email: verified?.emailAddress ?? null,
    name:
      [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
      user.username ||
      null,
    imageUrl: user.imageUrl ?? null,
  };

  // ── 2. Find or create the Supabase account ─────────────────────────────────
  // `mode` is the whole difference between the two pages, and it is enforced
  // HERE, on the server, not in the browser:
  //
  //   signin — the account must already exist. An address we have never seen is
  //            refused with `noAccount`, so the login page cannot be used to
  //            quietly create accounts.
  //   signup — the account is created if it is missing, with the role picked on
  //            the sign-up page.
  //
  // The LOOKUP is what matters in both cases. `findOrCreateSupabaseUser`
  // matches on email, so someone who already has an account — including a
  // Google user created by the old Appwrite flow — is handed back their
  // EXISTING Supabase user id: same profile, same role, same orders and chats.
  let resolved: { userId: string; email: string; created: boolean } | null;
  try {
    resolved = await findOrCreateSupabaseUser(identity, {
      allowCreate: mode === "signup",
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
        "Your account did not share a verified email address, so we cannot create a Jova account. Try a different sign-in method.",
    };
  }

  // ── 3. Mint the Supabase session cookie ────────────────────────────────────
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

  // ── 4. Where to land ───────────────────────────────────────────────────────
  // A brand-new signup has not given us a phone number or an LGA yet, and a
  // seller has a whole onboarding flow to finish. Both must be sent to the step
  // that collects what is missing — never straight to a dashboard.
  if (resolved.created) {
    if (role === "seller") {
      // Verification → shop creation → plan payment → approval. The seller hub
      // is gated on an approved shop, so this is the only correct entry.
      return { ok: true, next: "/seller/onboarding?step=1" };
    }
    // Buyer: collect the local government and phone number before anything
    // else. `next` carries them to the storefront afterwards.
    return { ok: true, next: "/signup/complete" };
  }

  // ── Already has an account, but came through the SIGN-UP page ──────────────
  // They pressed "create an account" for an email that is already registered.
  // Do not silently sign them in from the sign-up door: say the account already
  // exists and point them at login.
  if (mode === "signup") {
    return { ok: false, error: "existing", existing: true };
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
 * Clear the Supabase session cookie.
 *
 * The Clerk session is cleared in the browser by `signOut()` from `useClerk()`
 * — see `src/components/sign-out-button.tsx`. Doing only one would leave the
 * user half signed in: still able to load seller pages, or still holding a
 * Clerk session that would silently sign them back in on the next visit.
 */
export async function signOutSupabase(): Promise<void> {
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
