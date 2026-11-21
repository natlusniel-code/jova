"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Spinner, Alert } from "@/components/ui";

export function WhatsAppOtpForm({ mode }: { mode: "signup" | "login" }) {
  const router = useRouter();
  const params = useSearchParams();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [role, setRole] = useState<"buyer" | "seller">(params.get("role") === "seller" ? "seller" : "buyer");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); setInfo("");
    try {
      const response = await fetch("/api/auth/whatsapp-otp", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(step === "phone" ? { action: "request", purpose: mode, phone, role } : { action: "verify", purpose: mode, phone, code, role }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Something went wrong.");
      if (step === "phone") { setStep("code"); setInfo("We sent a 6-digit code to your WhatsApp. It expires in 5 minutes."); }
      else { router.replace(result.next || "/"); router.refresh(); }
    } catch (e) { setError(e instanceof Error ? e.message : "Please try again."); }
    finally { setBusy(false); }
  }

  return <div className="w-full">
    <div className="mb-5">
      <Link href={mode === "signup" ? "/signup" : "/auth"} className="text-[12px] font-semibold text-brand-600 hover:underline">← Back to all sign-in options</Link>
      <h1 className="mt-4 font-display text-[25px] font-extrabold tracking-[-0.035em] text-ink-900">{mode === "signup" ? "Create your Jova account" : "Log in with WhatsApp"}</h1>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-500">{step === "phone" ? "We'll send a secure one-time code to your WhatsApp number." : "Enter the 6-digit code sent to your WhatsApp."}</p>
    </div>
    {mode === "signup" && step === "phone" && <div className="mb-4 grid grid-cols-2 gap-2">
      {(["buyer", "seller"] as const).map(value => <button key={value} type="button" onClick={() => setRole(value)} aria-pressed={role === value} className={`rounded-xl border-2 p-3 text-left text-[13px] font-bold transition ${role === value ? "border-brand-500 bg-brand-50 text-brand-700" : "border-[var(--line)] bg-white text-ink-600"}`}>{value === "buyer" ? "🛒 I'm here to buy" : "🏪 I'm here to sell"}</button>)}
    </div>}
    {info && <div className="mb-3 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2.5 text-[12.5px] text-brand-800">{info}</div>}
    {error && <div className="mb-3"><Alert tone="red">{error}</Alert></div>}
    <form onSubmit={submit} className="space-y-3">
      {step === "phone" ? <label className="block"><span className="mb-1.5 block text-[12px] font-semibold text-ink-700">WhatsApp phone number</span><input autoFocus type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="08012345678" required maxLength={18} className="w-full rounded-[13px] border border-[var(--line)] bg-white px-3.5 py-3 text-[15px] text-ink-900 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"/></label>
      : <label className="block"><span className="mb-1.5 block text-[12px] font-semibold text-ink-700">6-digit verification code</span><input autoFocus type="text" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0,6))} placeholder="000000" required maxLength={6} className="w-full rounded-[13px] border border-[var(--line)] bg-white px-3.5 py-3 text-center text-[22px] font-bold tracking-[0.35em] text-ink-900 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"/></label>}
      <button type="submit" disabled={busy || (step === "code" && code.length !== 6)} className="nm-btn-primary flex w-full items-center justify-center gap-2 py-3 text-[14px] disabled:opacity-50">{busy && <Spinner/>}{busy ? "Please wait…" : step === "phone" ? "Send WhatsApp code" : "Verify and continue"}</button>
    </form>
    {step === "code" && <div className="mt-4 flex items-center justify-between text-[12px]"><button type="button" onClick={() => {setStep("phone");setCode("");setInfo("");setError("");}} className="font-semibold text-brand-600 hover:underline">Change number</button><button type="button" disabled={busy} onClick={() => {setStep("phone");setCode("");setInfo("");setError("");}} className="font-semibold text-brand-600 hover:underline disabled:opacity-50">Resend code</button></div>}
    <p className="mt-5 text-center text-[12px] text-ink-500">{mode === "signup" ? <>Already have an account? <Link href="/auth/whatsapp?mode=login" className="font-bold text-brand-600">Log in</Link></> : <>New to Jova? <Link href="/auth/whatsapp?mode=signup" className="font-bold text-brand-600">Create an account</Link></>}</p>
  </div>;
}
