"use client";

import { ID } from "appwrite";
import { appwrite } from "./client";
import { friendlyAuthError } from "./errors";

export type SendCodeResult =
  | { ok: true; userId: string }
  | { ok: false; error: string };

export type ConfirmCodeResult =
  | { ok: true; jwt: string }
  | { ok: false; error: string; needsNewCode: boolean };

/**
 * Email verification by 6-digit code, sent and confirmed through Appwrite.
 *
 * ── Why this is not `createEmailVerificationOTP` ──────────────────────────
 * `account.createEmailVerificationOTP()` is the endpoint designed for exactly
 * this, and it is what we wanted to use. It cannot be used here, and this was
 * verified against the live Appwrite API rather than assumed:
 *
 *   POST /account/verifications/email/otp
 *     → 401 general_unauthorized_scope
 *       "User (role: guests) missing scopes (["account"])"
 *
 * The endpoint sends the code to *the currently logged-in user's* address, so
 * it requires an Appwrite session. NaijaMart's users live in Supabase and are
 * not signed in to Appwrite at signup time, so there is no session to send
 * from. Appwrite's own documentation states the same requirement: "make sure
 * the user is logged in" before calling it.
 *
 * ── What this uses instead ────────────────────────────────────────────────
 * `account.createEmailToken()` — the Email OTP route — needs no session. It
 * asks Appwrite to mail a 6-digit code from its built-in SMTP, valid 15
 * minutes, and returns the `userId` the code belongs to. Confirming the code
 * means exchanging it for a session with `account.createSession()`. That
 * exchange only succeeds if the code is correct, which is precisely the proof
 * we want: the person can read the inbox. The session is then used once to
 * mint a JWT (so the server can trust who confirmed) and deleted immediately.
 *
 * Both halves were exercised against the live API while building this:
 *   POST /account/tokens/email  (no session)      → 201, returns userId
 *   POST /account/sessions/token (wrong code)     → 401 user_invalid_token
 *
 * ── No secrets, no mail credentials ──────────────────────────────────────
 * There is no Resend key, no `EMAIL_FROM` and no SMTP configuration. Appwrite
 * sends from its own address and owns the template, which is the trade the
 * brief asks for. The project ID and endpoint are public by design.
 *
 * ── Why userId travels in the URL ────────────────────────────────────────
 * The send and the confirm are two different page loads. `userId` is not a
 * secret — it identifies the pending token, and the code is what authorises.
 * It is passed through the query string so a refresh does not lose it.
 */

/**
 * Ask Appwrite to email a 6-digit code to `email`.
 *
 * Returns the `userId` the code belongs to, which the confirm step needs.
 * Never throws: the caller gets a plain sentence instead.
 */
export async function sendVerificationCode(
  email: string,
): Promise<SendCodeResult> {
  try {
    const { account } = appwrite();
    const token = await account.createEmailToken({
      userId: ID.unique(),
      email: email.trim().toLowerCase(),
    });

    if (!token?.userId) {
      return {
        ok: false,
        error:
          "We could not send your verification code just now. Please try again in a moment.",
      };
    }

    return { ok: true, userId: token.userId };
  } catch (e) {
    const { message } = friendlyAuthError(e);
    return { ok: false, error: message };
  }
}

/**
 * Confirm a 6-digit code.
 *
 * A correct code is exchanged for an Appwrite session — that exchange is the
 * proof of inbox access. A JWT is minted from that session so the server can
 * verify who confirmed, and the session is then deleted so we never leave a
 * live Appwrite session behind for a user who belongs to Supabase.
 *
 * The JWT is short-lived and only ever used to authorise mirroring the
 * verified flag into Supabase.
 */
export async function confirmVerificationCode(
  userId: string,
  code: string,
): Promise<ConfirmCodeResult> {
  const clean = code.replace(/\D/g, "").slice(0, 6);

  if (clean.length !== 6) {
    return {
      ok: false,
      error: "Enter the 6-digit code from the email.",
      needsNewCode: false,
    };
  }

  const { account } = appwrite();

  try {
    await account.createSession({ userId, secret: clean });
  } catch (e) {
    const { message, needsNewCode } = friendlyAuthError(e);
    return { ok: false, error: message, needsNewCode };
  }

  let jwt = "";
  try {
    // The session exists only for as long as this block runs.
    jwt = (await account.createJWT()).jwt;
  } catch {
    // The code was still correct — we just could not mint the JWT. The caller
    // can sign in and retry; the address is genuinely confirmed either way.
  } finally {
    try {
      await account.deleteSession({ sessionId: "current" });
    } catch {
      // Already gone. Nothing to clean up.
    }
  }

  if (!jwt) {
    return {
      ok: false,
      error:
        "Your email was confirmed, but we could not finish setting up your account. Please sign in to continue.",
      needsNewCode: false,
    };
  }

  return { ok: true, jwt };
}
