"use client";

import { useState } from "react";
import Link from "next/link";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { Alert } from "@/components/ui";
import { cn } from "@/lib/utils";

type Role = "buyer" | "seller";

const ROLES: { key: Role; title: string; body: string; icon: React.ReactNode }[] = [
  {
    key: "buyer",
    title: "I'm here to buy",
    body: "Shop goods or book a service from verified sellers near you.",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 7h12l-1.2 12.2a2 2 0 0 1-2 1.8H9.2a2 2 0 0 1-2-1.8L6 7Z" />
        <path d="M9 7V5.5a3 3 0 0 1 6 0V7" />
      </svg>
    ),
  },
  {
    key: "seller",
    title: "I'm here to sell",
    body: "Open a shop, list products or offer your skills.",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M3.5 9.5 5 4.5h14l1.5 5" />
        <path d="M3.5 9.5a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0" />
        <path d="M5 12v7.5h14V12" />
      </svg>
    ),
  },
];

/**
 * The one and only way into NaijaMart.
 *
 * ── Why there is no form ────────────────────────────────────────────────────
 * Email sign-up, email sign-in, the 6-digit verification code and the
 * password reset are all gone. Google is the only identity provider, so this
 * screen has exactly one action. There is no email field to fill, no password
 * to choose, and no "confirm your email" step to wait for — Google has already
 * verified the address before it hands the identity back.
 *
 * ── Why the role picker is still here ───────────────────────────────────────
 * Google tells us who someone is, not what they came to do. A seller needs to
 * land in onboarding (verification → shop → plan), a buyer needs to land on
 * the storefront after giving a phone number and LGA. The choice is carried
 * through the OAuth round trip and enforced on the server.
 *
 * It is deliberately NOT a second step: it is a two-card toggle above the
 * button, defaulting to buyer, so the common case is one tap. And it can never
 * demote anyone — an existing seller who signs in with the buyer card selected
 * keeps their seller role, because the server reuses the account it finds by
 * email rather than overwriting it.
 *
 * ── Why one button covers both sign-in and sign-up ──────────────────────────
 * With email gone, "sign in" and "sign up" are the same act: prove you own an
 * address. The server creates the account if it is new and reuses it if it is
 * not, so there is no longer a reason to make people choose a door first.
 */
export function GoogleAuthPanel({
  next,
  initialRole = "buyer",
}: {
  next?: string;
  initialRole?: Role;
}) {
  const [role, setRole] = useState<Role>(initialRole);
  const [error, setError] = useState("");

  return (
    <div>
      <h1 className="text-[27px] font-extrabold leading-tight tracking-tight text-ink-900">
        Welcome to NaijaMart
      </h1>
      <p className="mt-1.5 text-[14px] leading-relaxed text-ink-500">
        One tap with Google and you&apos;re in — no password to create or
        remember.
      </p>

      {/* ── Role ─────────────────────────────────────────────────────────── */}
      <p className="mt-6 text-[12px] font-bold uppercase tracking-wider text-ink-500">
        What brings you here?
      </p>
      <div className="mt-2 grid gap-2.5 sm:grid-cols-2">
        {ROLES.map((r) => {
          const active = role === r.key;
          return (
            <button
              key={r.key}
              type="button"
              onClick={() => setRole(r.key)}
              aria-pressed={active}
              className={cn(
                "relative rounded-2xl border-2 p-3.5 text-left transition",
                active
                  ? "border-brand-500 bg-brand-50/70 shadow-card"
                  : "border-[var(--line)] bg-white hover:border-brand-300 hover:bg-brand-50/30",
              )}
            >
              <span
                className={cn(
                  "grid h-8 w-8 place-items-center rounded-xl",
                  active ? "bg-brand-500 text-white" : "bg-slate-100 text-ink-500",
                )}
              >
                {r.icon}
              </span>
              <p className="mt-2 text-[13.5px] font-bold leading-snug text-ink-900">
                {r.title}
              </p>
              <p className="mt-0.5 text-[12px] leading-relaxed text-ink-500">
                {r.body}
              </p>
              <span
                className={cn(
                  "absolute right-3 top-3 grid h-4.5 w-4.5 place-items-center rounded-full border-2",
                  active ? "border-brand-500 bg-brand-500 text-white" : "border-slate-300",
                )}
                style={{ height: 18, width: 18 }}
              >
                {active && (
                  <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth={4}>
                    <path d="m5 13 4 4L19 7" />
                  </svg>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── The only action ──────────────────────────────────────────────── */}
      <div className="mt-5 space-y-3">
        {error && (
          <Alert tone="red" title="Sign-in did not complete">
            {error}
          </Alert>
        )}

        <GoogleSignInButton
          mode="signup"
          role={role}
          next={next}
          label="Continue with Google"
          onError={setError}
        />

        <p className="text-center text-[12px] leading-relaxed text-ink-400">
          We&apos;ll use your Google name and email. Nothing is posted to Google.
        </p>
      </div>

      <div className="mt-6 rounded-xl bg-slate-50 p-3.5">
        <p className="text-[12.5px] leading-relaxed text-ink-600">
          <strong className="font-semibold text-ink-800">
            Already have an account?
          </strong>{" "}
          Just continue with Google using the same email address — you&apos;ll go
          straight back into your existing profile, orders and chats.
        </p>
      </div>

      <p className="mt-6 text-[11.5px] leading-relaxed text-ink-400">
        By continuing you agree to our{" "}
        <Link href="/legal/terms" className="underline">
          Terms
        </Link>{" "}
        and{" "}
        <Link href="/legal/refunds" className="underline">
          Refund Policy
        </Link>
        .
      </p>
    </div>
  );
}
