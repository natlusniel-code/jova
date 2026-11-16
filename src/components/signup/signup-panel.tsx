"use client";

import { useState } from "react";
import Link from "next/link";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { cn } from "@/lib/utils";

type Role = "buyer" | "seller";

const ROLES: { key: Role; emoji: string; title: string; body: string }[] = [
  {
    key: "buyer",
    // The original sign-up icons, restored. They were replaced with custom
    // line-art SVGs during the auth rework; the brief asks for the first
    // design's icons back, and these are exactly them.
    emoji: "🛒",
    title: "I'm here to buy",
    body: "Shop goods or book a service from verified sellers near you.",
  },
  {
    key: "seller",
    emoji: "🏪",
    title: "I'm here to sell",
    body: "Open a shop, list products or offer your skills.",
  },
];

/**
 * `/signup` — the SIGN-UP page.
 *
 * ── Visual design is unchanged ───────────────────────────────────
 * Same heading, same two role cards, same borders, same colours, same "Already
 * have an account? Sign in" footer as the version this replaces. The only
 * things that changed are behaviour:
 *
 * ── "Continue with Google" appears only AFTER a role is chosen ─────
 * The brief is explicit: no Google button on the sign-up page itself; it shows
 * up once the person has clicked buyer or seller account creation. So the
 * first screen is the role choice alone. Choosing a card reveals the Google
 * button (labelled for the role that was picked) and the "Continue" button
 * that used to carry them to the details form.
 *
 * This also keeps the role meaningful: with Google we get a name and a
 * verified email but no idea what the person came to do, so the choice has to
 * be made before it can travel through the OAuth round trip.
 *
 * ── Account already exists ──────────────────────────────────────
 * Someone tries to sign up with a Google address that is already registered.
 * The server refuses to re-create it and sends them back with `?existing=1`;
 * this panel then says the account exists and points at login, which is where
 * their real profile, orders and chats live.
 *
 * ── Where sign-up lands ─────────────────────────────────────────
 * A new buyer goes to `/signup/complete` — the account-completion page that
 * already exists — never the storefront. A new seller goes to onboarding.
 * That decision is made server-side in `bridgeGoogleSession`, not here.
 */
export function SignupPanel({
  initialRole,
  next,
  existing = false,
}: {
  initialRole?: Role | null;
  next?: string;
  existing?: boolean;
}) {
  const [role, setRole] = useState<Role | null>(initialRole ?? null);

  return (
    <div>
      <h1 className="text-[26px] font-extrabold tracking-tight text-ink-900">
        Create your account
      </h1>
      <p className="mt-1.5 text-[14px] text-ink-500">
        Tell us what you&apos;re here for. You can always add a shop later.
      </p>

      {/* ── Account already exists ───────────────────────────────────── */}
      {existing && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3">
          <p className="text-[13px] font-bold text-amber-900">
            You already have an account
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-amber-800">
            That Google address is already registered with NaijaMart. Log in
            instead to get back to your profile, orders and chats.
          </p>
          <Link href="/auth" className="nm-btn-primary mt-3 w-full !py-2.5 text-[14px]">
            Log in
          </Link>
        </div>
      )}

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {ROLES.map((c) => {
          const active = role === c.key;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => setRole(c.key)}
              aria-pressed={active}
              className={cn(
                "relative rounded-2xl border-2 p-4 text-left transition",
                active
                  ? "border-brand-500 bg-brand-50/60 shadow-card"
                  : "border-[var(--line)] bg-white hover:border-brand-300 hover:bg-brand-50/30",
              )}
            >
              <span
                className={cn(
                  "grid h-8 w-8 place-items-center rounded-xl text-[17px] leading-none",
                  active ? "bg-brand-500" : "bg-slate-100",
                )}
                aria-hidden="true"
              >
                {c.emoji}
              </span>
              <p className="mt-2 text-[14.5px] font-bold leading-snug text-ink-900">
                {c.title}
              </p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-ink-500">
                {c.body}
              </p>
              <span
                className={cn(
                  "absolute right-3 top-3 grid place-items-center rounded-full border-2",
                  active
                    ? "border-brand-500 bg-brand-500 text-white"
                    : "border-slate-300",
                )}
                style={{ height: 18, width: 18 }}
              >
                {active && (
                  <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth={3.5}>
                    <path d="m5 13 4 4L19 7" />
                  </svg>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── The Google step, revealed only after a choice ──────────────
          Nothing Google-related is shown until `role` is set, which is what
          the brief asks for. */}
      {role ? (
        <div className="mt-5">
          <div className="relative overflow-hidden rounded-2xl border border-white/60 bg-white/60 p-4 shadow-[0_8px_32px_-8px_rgba(15,23,42,0.22)] backdrop-blur-xl backdrop-saturate-150">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/70 via-white/10 to-white/0" />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent" />
            <div className="relative">
              <GoogleSignInButton
                mode="signup"
                role={role}
                next={next}
                label={
                  role === "seller"
                    ? "Continue with Google to open a shop"
                    : "Continue with Google to start buying"
                }
                className="!bg-white/85 hover:!bg-white !text-ink-900 !shadow-none border !border-slate-200/80 backdrop-blur"
              />
              <p className="mt-3.5 text-center text-[11.5px] leading-relaxed text-ink-500">
                We&apos;ll use your Google name and email. Nothing is posted to Google.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-5 rounded-xl border border-dashed border-[var(--line)] bg-slate-50/60 px-4 py-3">
          <p className="text-center text-[12.5px] leading-relaxed text-ink-500">
            Choose buyer or seller above, then continue with Google.
          </p>
        </div>
      )}

      <p className="mt-5 text-center text-[13px] text-ink-500">
        Already have an account?{" "}
        <Link href="/auth" className="font-semibold text-brand-600 hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
