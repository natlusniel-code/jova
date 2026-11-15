import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Email verification — the Supabase side.
 *
 * ── Who sends the mail ────────────────────────────────────────────────────
 * Appwrite does, from its own built-in SMTP. This app has no mail provider:
 * no Resend key, no `EMAIL_FROM`, no SMTP socket, no template. The sending
 * and the code check both happen in the browser (src/lib/appwrite/otp.ts),
 * because Appwrite binds the emailed code to the requesting origin.
 *
 * ── What is left here ─────────────────────────────────────────────────────
 * Only the flag. `profiles.email_verified_at` is what the marketplace reads —
 * RLS policies, the sign-in gate and every page already use it, and none of
 * them should have to call Appwrite to find out whether an address is real.
 * So this module owns the two operations on that flag:
 *
 *   • `markEmailVerified` — write it, after Appwrite has confirmed the code;
 *   • `isEmailVerified`   — read it, on the sign-in path.
 *
 * Both go through SQL functions (sql/0046) so the rule lives in the database
 * rather than being re-implemented in every caller.
 */

/**
 * Mirror Appwrite's confirmed state into Supabase.
 *
 * Called by `confirmEmailCodeAction` only after the Appwrite JWT has been
 * verified, so the email passed here is the one Appwrite reported — never one
 * the browser supplied.
 *
 * A failure is logged but not surfaced: the address IS confirmed at Appwrite,
 * and the next sign-in attempt re-syncs it. Failing the whole flow here would
 * tell the person their code was wrong when it was not.
 */
export async function markEmailVerified(email: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.rpc("nm_set_email_verified", {
      p_email: email.trim().toLowerCase(),
    });
    if (error) {
      console.error("[email] could not mirror the verified flag", error);
    }
  } catch (e) {
    console.error("[email] could not mirror the verified flag", e);
  }
}

/**
 * Has this address been confirmed?
 *
 * Reads Supabase, which is what the sign-in gate and RLS already use. Returns
 * false on any error — an unreadable flag must never be treated as "verified".
 */
export async function isEmailVerified(email: string): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("nm_email_verified", {
      p_email: email.trim().toLowerCase(),
    });
    if (error) return false;
    return Boolean(data);
  } catch {
    return false;
  }
}
