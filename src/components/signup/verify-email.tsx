"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { resendVerificationAction } from "@/app/auth/actions";
import { Spinner, Alert } from "@/components/ui";

/**
 * Signup step 3 — "check your email".
 *
 * ── What this screen used to be ───────────────────────────────────────────
 * It displayed a 6-digit code in a dashed box and asked the person to retype
 * it. That verified nothing: the code was on the same screen, so anyone at the
 * keyboard could read it. It has been removed entirely.
 *
 * ── What it is now ────────────────────────────────────────────────────────
 * A confirmation that a link was sent to the address, and a way to send it
 * again. The actual confirmation happens when the link is opened, on
 * `/auth/verify`, where the token is consumed on the server.
 *
 * The resend button is rate-limited by the database (issuing a token deletes
 * the previous one), so a second click invalidates the first link rather than
 * leaving two live.
 */
export function VerifyEmail({
  email,
  role,
}: {
  email: string;
  role: string;
}) {
  const [err, setErr] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  function resend() {
    setErr("");
    setSent(false);

    const fd = new FormData();
    fd.set("email", email);
    fd.set("role", role);

    startTransition(async () => {
      const result = await resendVerificationAction(fd);
      if (!result.ok) {
        setErr(result.error);
        return;
      }
      setSent(true);
    });
  }

  return (
    <div className="mx-auto w-full max-w-[420px] text-center">
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-brand-50">
        <svg viewBox="0 0 24 24" className="h-8 w-8 text-brand-600" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="18" height="14" rx="2.2" />
          <path d="m3.5 7 8.5 6 8.5-6" />
        </svg>
      </div>

      <h1 className="mt-5 text-[24px] font-extrabold tracking-tight text-ink-900">
        Check your email
      </h1>
      <p className="mx-auto mt-1.5 max-w-[340px] text-[13.5px] leading-relaxed text-ink-500">
        We have sent a confirmation link to{" "}
        <strong className="font-semibold text-ink-800">{email}</strong>. Open it
        to confirm your account, then sign in with your email and password.
      </p>

      <div className="mt-5 rounded-2xl border border-[var(--line)] bg-slate-50/70 px-4 py-4 text-left">
        <p className="text-[12px] font-bold uppercase tracking-wider text-ink-500">
          What happens next
        </p>
        <ol className="mt-2 space-y-1.5 text-[13px] leading-relaxed text-ink-600">
          <li>1. Open the email from NaijaMart.</li>
          <li>2. Tap <strong className="text-ink-800">Confirm my email address</strong>.</li>
          <li>3. Sign in with your email and password.</li>
        </ol>
      </div>

      {err && <div className="mt-4"><Alert tone="red">{err}</Alert></div>}
      {sent && (
        <div className="mt-4">
          <Alert tone="green">A new link is on its way. The older one no longer works.</Alert>
        </div>
      )}

      <button
        onClick={resend}
        disabled={pending}
        className="nm-btn-ghost mt-4 w-full !py-3"
      >
        {pending ? <><Spinner /> Sending…</> : "Send the link again"}
      </button>

      <Alert tone="blue">
        The link expires in 48 hours. If you cannot find the email, check your
        spam folder before asking for another.
      </Alert>

      <p className="mt-4 text-[12.5px] text-ink-500">
        Wrong email?{" "}
        <Link href="/signup/details" className="font-semibold text-brand-600 hover:underline">
          Start again
        </Link>
      </p>
    </div>
  );
}
