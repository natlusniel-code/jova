"use server";

import {
  bridgeFirebaseSession as bridge,
  type FirebaseBridgeResult,
} from "@/lib/firebase/bridge";
import { requestClient } from "@/lib/auth/local";

export async function bridgeFirebaseSession(input: {
  idToken: string;
  mode: "signin" | "signup";
  role?: "buyer" | "seller";
  next?: string | null;
}): Promise<FirebaseBridgeResult> {
  if (
    !input ||
    typeof input.idToken !== "string" ||
    (input.mode !== "signin" && input.mode !== "signup")
  ) {
    return { ok: false, error: "Invalid sign-in request. Please try again." };
  }

  return bridge(input);
}

/**
 * Clear the Supabase session cookie.
 *
 * This used to live in `clerk-actions.ts` next to the Clerk bridge. With the
 * Clerk stack gone it belongs with the Firebase actions, which are the only
 * auth actions left. It deliberately does NOT redirect: the caller
 * (`sign-out-button.tsx`) also has to sign out of the Firebase client SDK, and
 * a redirect from inside the action would race that.
 */
export async function signOutSupabase(): Promise<void> {
  try {
    const supabase = requestClient();
    await supabase.auth.signOut();
  } catch {
    // No session to clear. The caller still navigates away.
  }
}
