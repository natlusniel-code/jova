import { AuthSplit } from "@/components/auth-split";
import { WhatsAppOtpForm } from "./whatsapp-otp-form";
export const metadata = { title: "WhatsApp verification" };
export default async function WhatsAppAuthPage({ searchParams }: { searchParams: Promise<{ mode?: string; role?: string }> }) {
  const params = await searchParams;
  const mode = params.mode === "signup" ? "signup" : "login";
  return <AuthSplit><WhatsAppOtpForm mode={mode} /></AuthSplit>;
}
