"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signUpAction } from "@/app/auth/actions";
import { cn } from "@/lib/utils";
import { Spinner, Alert } from "@/components/ui";

type Role = "buyer" | "seller";

/**
 * The plain email + password sign-up form.
 *
 * One screen: role, name, email, password. No confirmation email, no code, no
 * third-party provider — the account is created confirmed and signed in by the
 * server action, which then returns the destination.
 */
export function SignUpForm({
  initialRole,
  next,
}: {
  initialRole?: Role | null;
  next?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [role, setRole] = useState<Role>(initialRole ?? "buyer");
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
    if (!email.trim()) fe.email = "Enter your email address.";
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
        Tell us what you&apos;re here for. You can always add a shop later.
      </p>

      <form onSubmit={submit} className="mt-6 space-y-3.5" noValidate>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {(
            [
              { key: "buyer", emoji: "🛍️", title: "I want to buy / hire" },
              { key: "seller", emoji: "🏪", title: "I want to sell / offer services" },
            ] as const
          ).map((c) => {
            const active = role === c.key;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => setRole(c.key)}
                aria-pressed={active}
                className={cn(
                  "rounded-2xl border-2 p-3 text-left transition",
                  active
                    ? "border-brand-500 bg-brand-50/60"
                    : "border-[var(--line)] bg-white hover:border-brand-300",
                )}
              >
                <span className="text-xl">{c.emoji}</span>
                <p className="mt-1 text-[13px] font-bold leading-snug text-ink-900">
                  {c.title}
                </p>
              </button>
            );
          })}
        </div>

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
              {show ? "Hide" : "Show"}
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
