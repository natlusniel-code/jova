/**
 * Outbound email.
 *
 * ── Why Resend ────────────────────────────────────────────────────────────
 * It is a single HTTPS POST, so it works from a Vercel serverless function
 * with no SMTP sockets, no extra dependency and no connection pooling. The
 * whole transport is the `send` function below.
 *
 * ── Why it fails loudly in production but quietly in development ──────────
 * If `RESEND_API_KEY` is missing, signup would otherwise appear to succeed
 * while no mail ever arrives — the worst possible failure, because the person
 * waits for a link that was never sent. So in production a missing key throws
 * and the signup action reports it. In development it logs the link to the
 * server console instead, so the flow can be tested without a key.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** The From address. Must be a domain verified in Resend. */
const FROM =
  process.env.EMAIL_FROM ?? "NaijaMart <hello@naijamart.ng>";

/**
 * The one message a person ever sees when mail could not be sent.
 *
 * Deliberately free of status codes, provider names, error types and JSON.
 * Whatever actually went wrong is logged server-side by the caller above.
 */
const SEND_FAILED_MESSAGE =
  "We could not send your verification email just now. Please try again in a moment.";

export type SendResult = { ok: true } | { ok: false; error: string };

export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;

  if (!key) {
    if (process.env.NODE_ENV === "production") {
      return {
        ok: false,
        error:
          "Email is not configured on this deployment, so we could not send your verification link. Please contact support.",
      };
    }
    // Development: print the message so the flow is testable without a key.
    console.info(
      `\n─── [dev] email to ${input.to} ───\n${input.subject}\n\n${input.text}\n──────────────────────────────\n`,
    );
    return { ok: true };
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });

    if (!res.ok) {
      // The provider's response is a JSON error body with a status code and an
      // internal reason. That is useful in the server log and meaningless (and
      // alarming) on screen, so it is logged here and the caller gets one plain
      // sentence. Never return `body` to the UI: it is code-like text.
      const body = await res.text().catch(() => "");
      console.error(
        `[email] Resend rejected the message: ${res.status} ${body.slice(0, 500)}`,
      );
      return { ok: false, error: SEND_FAILED_MESSAGE };
    }
    return { ok: true };
  } catch (e) {
    console.error("[email] send failed", e);
    return { ok: false, error: SEND_FAILED_MESSAGE };
  }
}
