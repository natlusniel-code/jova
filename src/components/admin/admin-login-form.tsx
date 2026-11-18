"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { adminSignInAction } from "@/app/admin-fuckliving/login/actions";
import { Spinner, Alert } from "@/components/ui";

/**
 * The admin sign-in form.
 *
 * Email and password only — no sign-up link, no social provider, no
 * "forgot password" flow that would leak whether an address is staff. The
 * password is posted to a Server Action, so it never sits in browser state
 * and never appears in a URL.
 *
 * On success the action returns where to go: the console for an admin, `/`
 * for a signed-in non-admin. The 404 is reserved for the console itself.
 */
export function AdminLoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!email.trim()) return setErr("Enter your email address.");
    if (!password) return setErr("Enter your password.");

    const fd = new FormData();
    fd.set("email", email.trim());
    fd.set("password", password);
    if (next) fd.set("next", next);

    startTransition(async () => {
      const result = await adminSignInAction(fd);
      if (!result.ok) {
        setErr(result.error);
        return;
      }
      router.push(result.next);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3.5" noValidate>
      <div>
        <label className="nm-label" htmlFor="admin-email">
          Email address
        </label>
        <input
          id="admin-email"
          type="email"
          autoComplete="username"
          className="nm-input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@jova.com"
        />
      </div>

      <div>
        <label className="nm-label" htmlFor="admin-password">
          Password
        </label>
        <div className="relative">
          <input
            id="admin-password"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            className="nm-input pr-14"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-[11.5px] font-semibold text-ink-500 hover:bg-slate-100"
          >
            {show ? "Hide" : "Show"}
          </button>
        </div>
      </div>

      {err && <Alert tone="red">{err}</Alert>}

      <button type="submit" disabled={pending} className="nm-btn-primary w-full !py-3">
        {pending ? (
          <>
            <Spinner /> Signing in…
          </>
        ) : (
          "Sign in to the console"
        )}
      </button>
    </form>
  );
}
