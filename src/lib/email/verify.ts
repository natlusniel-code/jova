import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { verificationEmail } from "@/lib/email/templates";

/**
 * Email verification by link.
 *
 * ── What replaced what ────────────────────────────────────────────────────
 * The old method generated a 6-digit code, displayed it on the signup screen
 * and asked the person to retype it. That verified nothing: the code was
 * visible to whoever was already at the keyboard, so it proved no access to
 * the inbox at all. It is gone. A signup now sends a link to the address, and
 * only opening that link confirms the account.
 *
 * ── Where the state lives ─────────────────────────────────────────────────
 *   • the token — `one_time_codes`, purpose 'verify', 48-hour expiry, single
 *     use (deleted the moment it is consumed);
 *   • the confirmed flag — `profiles.email_verified_at`.
 *
 * Both are handled by the `nm_issue_verify_token` / `nm_consume_verify_token`
 * functions in sql/0044, so the rules live in the database rather than being
 * re-implemented in every caller.
 */

/** The public origin, for building the link. */
function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  // Vercel sets this for every deployment, including previews.
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

/**
 * Issue a token and email the link.
 *
 * Returns `{ ok: false }` with a readable message when the mail could not be
 * sent, so the signup action can tell the person the truth instead of leaving
 * them waiting for a link that never left the building.
 */
export async function sendVerificationEmail(input: {
  email: string;
  firstName: string;
  role: "buyer" | "seller";
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient();

  const { data: token, error } = await admin.rpc("nm_issue_verify_token", {
    p_email: input.email,
  });
  if (error) {
    // The RPC error is a Postgres message (`function … does not exist`,
    // `duplicate key value violates …`). It belongs in the log, not on the
    // signup screen, so it is never interpolated into the returned message.
    console.error("[email] could not issue a verification token", error);
    return {
      ok: false,
      error:
        "We could not prepare your verification link just now. Please try again in a moment.",
    };
  }

  const verifyUrl = `${siteUrl()}/auth/verify?token=${encodeURIComponent(String(token))}`;
  const mail = verificationEmail({
    firstName: input.firstName,
    verifyUrl,
    role: input.role,
  });

  return sendEmail({
    to: input.email,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
  });
}

/**
 * Consume a token. Returns the email it belonged to, or null when the token is
 * unknown, expired or already used.
 */
export async function consumeVerificationToken(
  token: string,
): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("nm_consume_verify_token", {
    p_token: token,
  });
  if (error) return null;
  return (data as string | null) ?? null;
}

/** Has this address been confirmed? */
export async function isEmailVerified(email: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("nm_email_verified", { p_email: email });
  if (error) return false;
  return Boolean(data);
}
