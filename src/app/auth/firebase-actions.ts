"use server";

import {
  bridgeFirebaseSession as bridge,
  type FirebaseBridgeResult,
} from "@/lib/firebase/bridge";

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
