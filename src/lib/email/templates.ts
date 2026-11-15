/**
 * The signup verification email.
 *
 * ── The voice ─────────────────────────────────────────────────────────────
 * Written the way a Nigerian business actually writes to a new customer:
 * warm, a little formal, and congratulatory — "Congratulations!", "You are
 * welcome", "No wahala". Not a translated American template. The greeting
 * uses the person's first name, and the body speaks about buying and selling
 * in their own city, because that is what NaijaMart is for.
 *
 * ── Why the link is the only action ───────────────────────────────────────
 * The old flow showed a code on screen and asked the person to retype it,
 * which proved nothing — whoever was at the keyboard could read it. This
 * email is the proof: only someone who can open the inbox can confirm the
 * address. So the link is the single call to action, and it is repeated in
 * plain text underneath for clients that strip buttons.
 */

const BRAND = "#0f7a4d";

export function verificationEmail(input: {
  firstName: string;
  verifyUrl: string;
  role: "buyer" | "seller";
}): { subject: string; html: string; text: string } {
  const name = input.firstName?.trim() || "friend";
  const isSeller = input.role === "seller";

  const subject = isSeller
    ? "Congratulations! Your NaijaMart seller account is ready to confirm"
    : "Congratulations! Welcome to NaijaMart";

  const intro = isSeller
    ? `Congratulations, ${name}! Your NaijaMart seller account has been created, and we are glad to have you join the market.`
    : `Congratulations, ${name}! Your NaijaMart account has been created, and we are happy to welcome you.`;

  const body = isSeller
    ? `One small step remains: confirm this email address, then set up your shop, complete your verification and choose a plan. Once your shop is approved, buyers in your city will be able to see and order from you.`
    : `One small step remains: confirm this email address. After that you can browse goods from sellers near you, place orders and follow them right through to delivery.`;

  const text = [
    intro,
    "",
    body,
    "",
    "Confirm your email address:",
    input.verifyUrl,
    "",
    "This link will expire in 48 hours. If it expires, you can request a new one from the sign-in page.",
    "",
    "If you did not create this account, please ignore this message — nothing will happen until the link is opened.",
    "",
    "You are welcome.",
    "The NaijaMart team",
  ].join("\n");

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f6f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f5;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e3e8e5;">
            <tr>
              <td style="background:${BRAND};padding:22px 28px;">
                <span style="color:#ffffff;font-size:19px;font-weight:800;letter-spacing:-0.3px;">NaijaMart</span>
              </td>
            </tr>
            <tr>
              <td style="padding:30px 28px 8px;">
                <h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:#111a15;font-weight:800;">
                  ${escapeHtml(intro)}
                </h1>
                <p style="margin:0 0 18px;font-size:15px;line-height:1.65;color:#3d4a43;">
                  ${escapeHtml(body)}
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 20px;">
                  <tr>
                    <td style="border-radius:10px;background:${BRAND};">
                      <a href="${escapeAttr(input.verifyUrl)}"
                         style="display:inline-block;padding:14px 26px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">
                        Confirm my email address
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 8px;font-size:12.5px;line-height:1.6;color:#6b7a72;">
                  If the button does not work, copy this address into your browser:
                </p>
                <p style="margin:0 0 22px;font-size:12.5px;line-height:1.6;word-break:break-all;">
                  <a href="${escapeAttr(input.verifyUrl)}" style="color:${BRAND};">${escapeHtml(input.verifyUrl)}</a>
                </p>
                <p style="margin:0 0 6px;font-size:13px;line-height:1.6;color:#3d4a43;">
                  This link will expire in <strong>48 hours</strong>. If it expires, you can request a new one from the sign-in page.
                </p>
                <p style="margin:0 0 24px;font-size:13px;line-height:1.6;color:#6b7a72;">
                  If you did not create this account, please ignore this message — nothing will happen until the link is opened.
                </p>
                <p style="margin:0 0 4px;font-size:14px;line-height:1.6;color:#111a15;font-weight:600;">You are welcome.</p>
                <p style="margin:0 0 26px;font-size:14px;line-height:1.6;color:#3d4a43;">The NaijaMart team</p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px 22px;border-top:1px solid #eef2f0;">
                <p style="margin:0;font-size:11.5px;line-height:1.6;color:#8a978f;">
                  You are receiving this because someone used this address to create a NaijaMart account.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, html, text };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, "&#39;");
}
