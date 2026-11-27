"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signUpAction } from "@/app/auth/actions";
import { cn } from "@/lib/utils";
import { Spinner, Alert } from "@/components/ui";

type Role = "buyer" | "seller";

/**
 * The sign-up details form — step two, after the role is chosen.
 *
 * ── What is kept from the original design ──────────────────────────────
 * The same fields in the same order (full name, email, password), the same
 * labels, the same show/hide password control, the same "Already have an
 * account? Sign in" footer. This is the form the site had before the auth
 * rework; only the plumbing underneath it changed.
 *
 * ── What is NOT kept ───────────────────────────────────────────────────
 * The original posted straight to Supabase from the browser. That is the
 * shape that produced the redirect race — the navigation could start before
 * the session cookie was readable by the server, so the destination's guard
 * saw "no session" and bounced back. Here the account is created by a Server
 * Action, which writes the cookies on its own response and confirms the
 * session before returning; the browser only navigates once it is real.
 *
 * ── Why the role is shown, not asked again ─────────────────────────────
 * It was settled on the previous step and travels in the URL. Re-asking it
 * here would let the two disagree, and the role decides where the account
 * lands. It is displayed as a small chip with a link back, so a wrong choice
 * is one tap to fix rather than a dead end.
 */
export function SignupDetails({
  role,
  next,
}: {
  role: Role;
  next?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});

  const working = busy || pending;

  async function submit(e: React.FormEvent) {
    e.preventDefault();

    const fe: Record<string, string> = {};
    if (fullName.trim().length < 3) fe.full_name = "Enter your full name.";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email.trim())) {
      fe.email = "Enter a valid email address.";
    }
    if (password.length < 8) fe.password = "Use at least 8 characters.";
    setFieldErr(fe);
    setErr("");
    if (Object.keys(fe).length) return;

    setBusy(true);
    const formData = new FormData();
    formData.set("full_name", fullName.trim());
    formData.set("email", email.trim());
    formData.set("password", password);
    formData.set("role", role);
    if (next) formData.set("next", next);

    let result: Awaited<ReturnType<typeof signUpAction>>;
    try {
      result = await signUpAction(formData);
    } catch {
      setBusy(false);
      setErr("We couldn't reach the server. Check your connection and try again.");
      return;
    }

    if (!result.ok) {
      setBusy(false);
      if (result.field && result.field !== "form") {
        setFieldErr({ [result.field]: result.error });
      } else {
        setErr(result.error);
      }
      return;
    }

    startTransition(() => {
      router.replace(result.next ?? "/");
      router.refresh();
    });
  }

  return (
    <div>
      <h1 className="text-[26px] font-extrabold tracking-tight text-ink-900">
        Create your account
      </h1>
      <p className="mt-1.5 text-[13.5px] text-ink-500">
        {role === "seller"
          ? "You'll set up your shop on the next screen."
          : "You'll add your phone and location on the next screen."}
      </p>

      {/* The role, carried from the previous step. */}
      <div className="mt-4 flex items-center justify-between rounded-xl border border-[var(--line)] bg-slate-50/70 px-3.5 py-2.5">
        <span className="flex items-center gap-2 text-[12.5px] font-semibold text-ink-700">
          <span aria-hidden="true">{role === "seller" ? "🏪" : "🛒"}</span>
          {role === "seller" ? "Selling / offering services" : "Buying / hiring"}
        </span>
        <Link
          href="/signup"
          className="text-[12px] font-semibold text-brand-600 hover:underline"
        >
          Change
        </Link>
      </div>

      <form onSubmit={submit} className="mt-5 space-y-3.5" noValidate>
        <div>
          <label className="nm-label" htmlFor="full_name">
            Full name
          </label>
          <input
            id="full_name"
            type="text"
            autoComplete="name"
            value={fullName}
            onChange={(e) => {
              setFullName(e.target.value);
              setFieldErr((f) => ({ ...f, full_name: "" }));
            }}
            className={cn("nm-input", fieldErr.full_name && "border-red-400")}
            placeholder="Tunde Adebayo"
          />
          {fieldErr.full_name && (
            <p className="mt-1 text-[12px] font-medium text-red-600">{fieldErr.full_name}</p>
          )}
        </div>

        <div>
          <label className="nm-label" htmlFor="email">
            Email address
          </label>
          <input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setFieldErr((f) => ({ ...f, email: "" }));
            }}
            className={cn("nm-input", fieldErr.email && "border-red-400")}
            placeholder="you@example.com"
          />
          {fieldErr.email && (
            <p className="mt-1 text-[12px] font-medium text-red-600">{fieldErr.email}</p>
          )}
        </div>

        <div>
          <label className="nm-label" htmlFor="password">
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              type={show ? "text" : "password"}
              autoComplete="new-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setFieldErr((f) => ({ ...f, password: "" }));
              }}
              className={cn("nm-input pr-11", fieldErr.password && "border-red-400")}
              placeholder="At least 8 characters"
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              aria-label={show ? "Hide password" : "Show password"}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-ink-400 hover:text-ink-700"
            >
              {show ? (
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                  <path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8" />
                  <path d="M6.7 6.7C4.6 8 3 10 2.2 12c1.6 3.5 5.2 6 9.8 6 1.7 0 3.3-.36 4.7-1M17.9 15.4c1.4-1.1 2.5-2.5 3.1-3.4-1.6-3.5-5.2-6-9.8-6-.6 0-1.2.05-1.7.14" />
                </svg>
              ) : (
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                  <path d="M2.2 12C3.8 8.5 7.4 6 12 6s8.2 2.5 9.8 6c-1.6 3.5-5.2 6-9.8 6s-8.2-2.5-9.8-6Z" />
                  <circle cx="12" cy="12" r="2.6" />
                </svg>
              )}
            </button>
          </div>
          {fieldErr.password && (
            <p className="mt-1 text-[12px] font-medium text-red-600">{fieldErr.password}</p>
          )}
        </div>

        {err && <Alert tone="red">{err}</Alert>}

        <button type="submit" disabled={working} className="nm-btn-primary w-full !py-3">
          {working ? (
            <>
              <Spinner /> Creating your account…
            </>
          ) : (
            "Create account"
          )}
        </button>
      </form>

      <p className="mt-5 text-center text-[13px] text-ink-500">
        Already have an account?{" "}
        <Link href="/auth" className="font-semibold text-brand-600 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
