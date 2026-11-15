"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Alert, Spinner } from "@/components/ui";
import { sendVerificationCode, confirmVerificationCode, endSession } from "@/lib/appwrite/otp";
import { confirmEmailCodeAction } from "@/app/auth/verify-code-action";

/**
 * "Check your email" — and type the 6-digit code.
 *
 * ── Who sends the mail ────────────────────────────────────────────────────
 * Appwrite does, from its own built-in SMTP. There is no Resend key and no
 * `EMAIL_FROM` in this app: the sender address is Appwrite's, the template is
 * Appwrite's, and nothing about mail delivery can be misconfigured on our
 * deployment.
 *
 * ── Why the code is typed and not clicked ─────────────────────────────────
 * A 6-digit code works on any device, survives a mail client that strips
 * links, and — unlike the old screen — is never displayed in the app itself.
 * The code only exists in the inbox, so typing it back is what proves access
 * to the address.
 *
 * ── Sending happens on mount ──────────────────────────────────────────────
 * Arriving here means signup just succeeded, so the first code goes out
 * without another click. `sentOnce` guards against React's development
 * double-mount sending two mails; a real second send is the explicit button.
 */

const CODE_LENGTH = 6;

export function VerifyEmail({ email, role }: { email: string; role: string }) {
  const [userId, setUserId] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState("");
  const [needsNewCode, setNeedsNewCode] = useState(false);
  const [done, setDone] = useState(false);
  const [sending, setSending] = useState(false);
  const [pending, startTransition] = useTransition();

  // A ref, not state: the guard must survive the double-invoked effect that
  // React runs in development without triggering a re-render itself.
  const sentOnce = useRef(false);

  async function send() {
    setErr("");
    setNotice("");
    setNeedsNewCode(false);
    setSending(true);

    const result = await sendVerificationCode(email);

    setSending(false);

    if (!result.ok) {
      setErr(result.error);
      return;
    }

    setUserId(result.userId);
    setNotice(
      "We have sent a 6-digit code to your email. It expires in 15 minutes.",
    );
  }

  useEffect(() => {
    if (sentOnce.current) return;
    sentOnce.current = true;
    void send();
    // `send` is intentionally not a dependency: this must run exactly once,
    // on arrival, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submit() {
    setErr("");
    setNotice("");

    if (!userId) {
      setErr(
        "We have not sent a code yet. Tap “Send me a new code”, then try again.",
      );
      return;
    }

    startTransition(async () => {
      const confirmed = await confirmVerificationCode(userId, code);

      if (!confirmed.ok) {
        setErr(confirmed.error);
        setNeedsNewCode(confirmed.needsNewCode);
        return;
      }

      // Appwrite has confirmed the code. Now tell Supabase, so the marketplace
      // (RLS, the sign-in gate) knows this address is real. The JWT proves to
      // the server that the confirmation really happened.
      //
      // The Appwrite session is deleted only AFTER the server has verified the
      // JWT: a JWT is only valid while its session exists, so deleting it first
      // would invalidate the very token we are about to send.
      const mirrored = await confirmEmailCodeAction(confirmed.jwt);

      await endSession(confirmed.sessionId);

      if (!mirrored.ok) {
        setErr(mirrored.error);
        return;
      }

      setDone(true);
    });
  }

  // ── Confirmed ─────────────────────────────────────────────────────────
  if (done) {
    return (
      <div className="mx-auto w-full max-w-[420px] text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-brand-50">
          <svg
            viewBox="0 0 24 24"
            className="h-8 w-8 text-brand-600"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>

        <h1 className="mt-5 text-[24px] font-extrabold tracking-tight text-ink-900">
          Your email is confirmed
        </h1>
        <p className="mx-auto mt-1.5 max-w-[330px] text-[13.5px] leading-relaxed text-ink-500">
          Thank you.{" "}
          <strong className="font-semibold text-ink-800">{email}</strong> is now
          verified — sign in with it and your password.
        </p>

        <Link href="/signin" className="nm-btn-primary mt-6 block w-full py-3">
          Sign in
        </Link>
      </div>
    );
  }

  // ── Waiting for the code ──────────────────────────────────────────────
  return (
    <div className="mx-auto w-full max-w-[420px]">
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-brand-50">
        <svg
          viewBox="0 0 24 24"
          className="h-8 w-8 text-brand-600"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.7}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="5" width="18" height="14" rx="2.2" />
          <path d="m3.5 7 8.5 6 8.5-6" />
        </svg>
      </div>

      <h1 className="mt-5 text-center text-[24px] font-extrabold tracking-tight text-ink-900">
        Enter your code
      </h1>
      <p className="mx-auto mt-1.5 max-w-[340px] text-center text-[13.5px] leading-relaxed text-ink-500">
        We sent a 6-digit code to{" "}
        <strong className="font-semibold text-ink-800">{email}</strong>. Type it
        below to confirm your account.
      </p>

      <label
        htmlFor="verify-code"
        className="mt-5 block text-[12px] font-bold uppercase tracking-wider text-ink-500"
      >
        Verification code
      </label>
      <input
        id="verify-code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={CODE_LENGTH}
        value={code}
        onChange={(e) =>
          setCode(e.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH))
        }
        onKeyDown={(e) => {
          if (e.key === "Enter" && code.length === CODE_LENGTH && !pending) {
            submit();
          }
        }}
        placeholder="••••••"
        className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-center text-[22px] font-bold tracking-[0.4em] text-ink-900 outline-none focus:border-brand-500"
      />

      {err && (
        <div className="mt-3">
          <Alert tone="red">{err}</Alert>
        </div>
      )}
      {notice && !err && (
        <div className="mt-3">
          <Alert tone="blue">{notice}</Alert>
        </div>
      )}

      <button
        onClick={submit}
        disabled={pending || code.length !== CODE_LENGTH}
        className="nm-btn-primary mt-3 w-full !py-3 disabled:opacity-50"
      >
        {pending ? (
          <>
            <Spinner /> Confirming…
          </>
        ) : (
          "Confirm my email"
        )}
      </button>

      <button
        onClick={send}
        disabled={sending}
        className="nm-btn-ghost mt-2.5 w-full !py-3 disabled:opacity-50"
      >
        {sending ? (
          <>
            <Spinner /> Sending…
          </>
        ) : needsNewCode ? (
          "Send me a new code"
        ) : (
          "Send the code again"
        )}
      </button>

      <p className="mt-4 text-center text-[12.5px] leading-relaxed text-ink-500">
        The code expires in 15 minutes and can only be used once. If it does not
        arrive, check your spam folder, then ask for a new one.
      </p>

      <p className="mt-2 text-center text-[12.5px] text-ink-500">
        Wrong email?{" "}
        <Link
          href="/signup/details"
          className="font-semibold text-brand-600 hover:underline"
        >
          Start again
        </Link>
      </p>
    </div>
  );
}
