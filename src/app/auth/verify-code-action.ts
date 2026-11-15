"use server";

import { verifyAppwriteJwt } from "@/lib/appwrite/server";
import { markEmailVerified } from "@/lib/email/verify";

/**
 * The server half of email verification.
 *
 * ── Why a server action at all ────────────────────────────────────────────
 * The browser talks to Appwrite directly: it asks for the code
 * (`createEmailToken`) and exchanges the typed code for a session
 * (`createSession`). Both need the project ID and nothing else, and doing
 * them in the browser is what lets Appwrite attach the `OTP-Token` autofill
 * header to the email, bound to our origin.
 *
 * Supabase, however, must be told the address is confirmed — and that write
 * needs the service role, which must never reach the browser. So the browser
 * sends the Appwrite JWT it minted from the confirmed session, and this
 * action verifies that JWT with Appwrite *before* touching Supabase.
 *
 * ── Why the JWT is verified, not trusted ─────────────────────────────────
 * Without the check, anyone could POST an email address and have it marked
 * confirmed. `verifyAppwriteJwt` asks Appwrite who the JWT belongs to; only
 * that answer is used, and the email that gets marked is the one Appwrite
 * reports — never one the browser supplied.
 */

export type VerifyResult =
  | { ok: true; email: string }
  | { ok: false; error: string };

export async function confirmEmailCodeAction(
  jwt: string,
): Promise<VerifyResult> {
  if (!jwt) {
    return {
      ok: false,
      error:
        "We could not confirm your email just now. Please request a new code and try again.",
    };
  }

  try {
    const user = await verifyAppwriteJwt(jwt);

    if (!user) {
      return {
        ok: false,
        error:
          "That confirmation has expired. Please request a new code and try again.",
      };
    }

    if (!user.email) {
      return {
        ok: false,
        error:
          "We could not read an email address from that confirmation. Please try again.",
      };
    }

    // Appwrite reported this user as verified — but only trust its own flag,
    // never the browser's word for it.
    if (!user.emailVerification) {
      return {
        ok: false,
        error:
          "We could not confirm your email just now. Please request a new code and try again.",
      };
    }

    await markEmailVerified(user.email);

    return { ok: true, email: user.email };
  } catch (e) {
    // The thrown value is an Appwrite or network error. It belongs in the
    // log, never on the screen.
    console.error("[auth] email confirmation failed", e);
    return {
      ok: false,
      error:
        "We could not confirm your email just now. Please try again in a moment.",
    };
  }
}
