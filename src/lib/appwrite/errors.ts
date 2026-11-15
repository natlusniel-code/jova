/**
 * One place that turns an Appwrite auth failure into a sentence a person reads.
 *
 * Appwrite reports failures as a `type` string plus a numeric `code` — e.g.
 * `{"type":"user_invalid_token","code":401}`. Neither belongs on screen. This
 * module is deliberately dependency-free (no SDK import, no `server-only`) so
 * the browser client, the verify screens and any server caller can all share
 * the same wording.
 */

/** Pull the Appwrite error `type` out of whatever was thrown. Never displayed. */
export function appwriteErrorType(e: unknown): string {
  if (e && typeof e === "object" && "type" in e) {
    const t = (e as { type?: unknown }).type;
    if (typeof t === "string") return t;
  }
  return "";
}

/**
 * Map an Appwrite auth failure to plain prose.
 *
 * Exhaustive over the cases the verification endpoints actually raise; anything
 * unrecognised falls through to a generic retry sentence rather than leaking
 * the raw message. The `needsNewCode` flag tells the UI whether to push the
 * person towards "send me a new code" — true for a wrong, expired or already
 * used code, which are indistinguishable to Appwrite and identical to fix.
 */
export function friendlyAuthError(
  e: unknown,
  context: "send" | "confirm" = "send",
): {
  message: string;
  needsNewCode: boolean;
} {
  switch (appwriteErrorType(e)) {
    case "user_email_already_verified":
      return {
        message:
          "This email address is already confirmed. You can sign in with it now.",
        needsNewCode: false,
      };

    case "user_email_not_found":
      return {
        message:
          "We could not send a code to that address. Check the spelling, or create an account first.",
        needsNewCode: false,
      };

    case "user_invalid_token":
      // Wrong code, expired code, or a code that was already used. Appwrite
      // returns the same type for all three, and the fix is the same: send a
      // fresh one.
      return {
        message:
          "That code is not right, or it has already been used. Ask for a new code and try again.",
        needsNewCode: true,
      };

    case "general_rate_limit_exceeded":
      return {
        message:
          "Too many codes have been requested for this address. Please wait a few minutes, then try again.",
        needsNewCode: false,
      };

    case "general_argument_invalid":
      return {
        message: "That email address does not look right. Check it and try again.",
        needsNewCode: false,
      };

    case "user_unauthorized":
    case "general_unauthorized_scope":
      return {
        message:
          "We could not confirm your email just now. Please sign in again and retry.",
        needsNewCode: false,
      };

    default:
      // The wording must match what the person was doing. A failed *confirm*
      // that said "we could not send your code" sent people hunting for a mail
      // that had already arrived.
      return {
        message:
          context === "confirm"
            ? "We could not confirm that code just now. Please try again, or ask for a new code."
            : "We could not send your verification code just now. Please try again in a moment.",
        needsNewCode: context === "confirm",
      };
  }
}
