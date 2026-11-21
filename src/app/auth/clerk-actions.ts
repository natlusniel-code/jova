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
  const rawNext = String(input?.next ?? "");
  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : null;

  // ── Why these are guarded ────────────────────────────────────────────────────
  // `auth()` and `currentUser()` throw when the Clerk secret key is missing or
  // Clerk is unreachable. This action is called from a client component whose
  // only error handling is the returned `{ ok: false }` — a throw escaped it
  // and surfaced as an unhandled rejection, leaving the button spinning with no
  // message. A failure to read the session is a failed sign-in, which is a
  // result this action already knows how to report.
  let clerkUserId: string | null = null;
  let user: Awaited<ReturnType<typeof currentUser>> = null;
  try {
    ({ userId: clerkUserId } = await auth());
    if (clerkUserId) user = await currentUser();
  } catch (e) {
    console.error("[bridge] could not read the Clerk session:", e);
    return {
      ok: false,
      error:
        "We could not confirm your sign-in with Clerk. Please try again — if it keeps happening, the site's Clerk keys need checking.",
    };
  }

  if (!clerkUserId) {
    return { ok: false, error: "Your sign-in did not complete. Please try again." };
  }

  if (!user) {
    return { ok: false, error: "Your sign-in did not complete. Please try again." };
  }

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
      error: e instanceof Error ? e.message : "We could not set up your account. Please try again.",
    };
  }

  if (!resolved) {
    return {
      ok: false,
      error: "Your account did not share a verified email address, so we cannot create a Jova account. Try a different sign-in method.",
    };
  }

  try {
    await mintSession(resolved.email);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "We could not start your session. Please try again.",
    };
  }

  if (resolved.created) {
    if (role === "seller") {
      return { ok: true, next: "/seller/onboarding?step=1" };
    }
    return { ok: true, next: "/signup/complete" };
  }

  // A duplicate signup means the verified identity already belongs to a Jova
  // account. Keep the session and send them to that account, rather than
  // returning them to a form that says they are already signed in.
  let destination = next ?? (role === "seller" ? "/seller/onboarding?step=1" : "/");
  try {
    const supabase = requestClient();
    destination = await postAuthDestination(supabase, resolved.userId, next);
  } catch {
    // Keep the safe role-based destination if the profile lookup is unavailable.
  }

  return { ok: true, next: destination };
}

export async function signOutSupabase(): Promise<void> {
  try {
    const supabase = requestClient();
    await supabase.auth.signOut();
  } catch {
    // No session to clear. The redirect still happens.
  }
}

export async function bridgeConfigured(): Promise<boolean> {
  try {
    createAdminClient();
    return true;
  } catch {
    return false;
  }
}
