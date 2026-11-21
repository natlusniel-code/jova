import { NextRequest, NextResponse } from "next/server";
import { createHmac, randomInt } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { mintSession } from "@/lib/auth/local";
import { postAuthDestination } from "@/lib/post-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Purpose = "signup" | "login";
const phonePattern = /^234[789][01]\d{8}$/;
function normalizePhone(raw: unknown): string | null {
  const value = String(raw ?? "").replace(/[\s()+.-]/g, "");
  const digits = value.startsWith("0") ? "234" + value.slice(1) : value;
  return phonePattern.test(digits) ? digits : null;
}
function codeHash(phone: string, code: string) {
  const secret = process.env.WHATSAPP_OTP_SECRET;
  if (!secret) throw new Error("WhatsApp OTP is not configured.");
  return createHmac("sha256", secret).update(phone + ":" + code).digest("hex");
}
function syntheticEmail(phone: string) { return phone + "@phone.jova.invalid"; }
async function sendWhatsApp(phone: string, message: string) {
  const token = process.env.WAAPI_API_KEY;
  const instance = process.env.WAAPI_INSTANCE_ID;
  if (!token || !instance) throw new Error("WhatsApp delivery is not configured.");
  const response = await fetch(`https://waapi.app/api/v1/instances/${encodeURIComponent(instance)}/client/action/send-message`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ chatId: `${phone}@c.us`, message }),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.status !== "success" || payload?.data?.status !== "success") throw new Error("WhatsApp could not send the verification code.");
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = body?.action;
    const purpose = body?.purpose as Purpose;
    const phone = normalizePhone(body?.phone);
    if (!phone) return NextResponse.json({ error: "Enter a valid Nigerian mobile number, e.g. 08012345678." }, { status: 400 });
    if (purpose !== "signup" && purpose !== "login") return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    const admin = createAdminClient();

    if (action === "request") {
      const localPhone = "0" + phone.slice(3);
      const { data: profile, error } = await admin.from("profiles").select("id, role").or(`phone.eq.${phone},phone.eq.+${phone},phone.eq.${localPhone}`).maybeSingle();
      if (error) throw error;
      if (purpose === "signup" && profile) return NextResponse.json({ error: "This phone number already has a Jova account. Please log in." }, { status: 409 });
      if (purpose === "login" && !profile) return NextResponse.json({ error: "No Jova account was found for this phone number. Please sign up first." }, { status: 404 });

      const userId = profile?.id ?? crypto.randomUUID();
      const code = String(randomInt(100000, 1000000));
      const issued = await admin.rpc("nm_issue_whatsapp_otp", { p_phone: phone, p_purpose: purpose, p_user_id: userId, p_code_hash: codeHash(phone, code) });
      if (issued.error) throw issued.error;
      if (!issued.data?.ok) {
        const wait = Number(issued.data?.retry_after ?? 60);
        return NextResponse.json({ error: issued.data?.reason === "hourly_limit" ? "Too many codes requested. Try again in an hour." : `Please wait ${wait} seconds before requesting another code.`, retryAfter: wait }, { status: 429 });
      }
      try { await sendWhatsApp(phone, `Your Jova verification code is ${code}. It expires in 5 minutes. Do not share this code with anyone.`); }
      catch (error) { await admin.from("whatsapp_otp_challenges").delete().eq("phone", phone); throw error; }
      return NextResponse.json({ ok: true, message: "Code sent to your WhatsApp." });
    }

    if (action === "verify") {
      const code = String(body?.code ?? "").replace(/\s/g, "");
      if (!/^\d{6}$/.test(code)) return NextResponse.json({ error: "Enter the 6-digit code." }, { status: 400 });
      const checked = await admin.rpc("nm_verify_whatsapp_otp", { p_phone: phone, p_code_hash: codeHash(phone, code) });
      if (checked.error) throw checked.error;
      if (!checked.data?.ok) {
        const messages: Record<string, string> = { expired: "That code has expired. Request a new one.", locked: "Too many incorrect attempts. Request a new code.", mismatch: "That code is incorrect.", no_code: "Request a new code first." };
        return NextResponse.json({ error: messages[checked.data?.reason] ?? "Could not verify that code.", attemptsLeft: checked.data?.attempts_left }, { status: 400 });
      }

      let email = syntheticEmail(phone);
      let role = "buyer";
      if (checked.data.purpose === "signup") {
        const chosenRole = body?.role === "seller" ? "seller" : "buyer";
        const created = await admin.auth.admin.createUser({
          email,
          password: randomInt(0, 0x7fffffff).toString(16) + crypto.randomUUID() + crypto.randomUUID(),
          email_confirm: true,
          user_metadata: { phone, role: chosenRole, auth_provider: "whatsapp_otp" },
        });
        if (created.error) {
          if (/already|exists|registered/i.test(created.error.message)) return NextResponse.json({ error: "This phone number already has an account. Please log in." }, { status: 409 });
          throw created.error;
        }
        role = chosenRole;
        const { error: profileError } = await admin.from("profiles").update({ phone, phone_verified_at: new Date().toISOString(), role }).eq("id", created.data.user.id);
        if (profileError) throw profileError;
      } else {
        const localPhone = "0" + phone.slice(3);
        const { data: profile, error } = await admin.from("profiles").select("id, role, is_banned").or(`phone.eq.${phone},phone.eq.+${phone},phone.eq.${localPhone}`).maybeSingle();
        if (error) throw error;
        if (!profile || profile.id !== checked.data.user_id) return NextResponse.json({ error: "Account verification could not be completed. Request a new code." }, { status: 400 });
        if (profile.is_banned) return NextResponse.json({ error: "This account is unavailable. Contact Jova support." }, { status: 403 });
        role = profile.role ?? "buyer";
        const { data: authUser, error: userError } = await admin.auth.admin.getUserById(profile.id);
        if (userError || !authUser.user?.email) throw new Error("Could not load the account session.");
        email = authUser.user.email;
        await admin.from("profiles").update({ phone_verified_at: new Date().toISOString() }).eq("id", profile.id);
      }

      await mintSession(email);
      const destination = await postAuthDestination(admin, userId, null, role).catch(() => role === "seller" ? "/seller/onboarding?step=1" : "/");
      return NextResponse.json({ ok: true, next: destination });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  } catch (error) {
    console.error("[whatsapp-otp]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "WhatsApp verification is temporarily unavailable." }, { status: 503 });
  }
}
