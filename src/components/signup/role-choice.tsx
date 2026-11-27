"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui";

type Role = "buyer" | "seller";

/**
 * The two sign-up cards, with the icons the site has always used.
 *
 * ── Why emoji and not line-art SVGs ────────────────────────────────────
 * The auth rework replaced these with custom stroke icons, and the sign-up
 * page stopped reading like the rest of the marketplace. These are the
 * original pair — a shopping trolley for buying, a shopfront for selling —
 * and they are the fastest thing on the page to understand: a person knows
 * which one they are before they read a word.
 *
 * ── Why the choice is a separate step ──────────────────────────────────
 * The role decides where the account lands (storefront vs seller
 * onboarding) and what the details form asks for, so it has to be settled
 * before the form is filled in. Asking it first also means the details page
 * can be linked directly with `?role=seller` and still be correct.
 */
const CARDS: { key: Role; emoji: string; title: string; body: string }[] = [
  {
    key: "buyer",
    emoji: "🛒",
    title: "I want to buy / hire",
    body: "Shop goods or book a service from verified sellers near you.",
  },
  {
    key: "seller",
    emoji: "🏪",
    title: "I want to sell / offer services",
    body: "Open a shop, list your products or offer your skills.",
  },
];

export function RoleChoice({
  initialRole,
  next,
}: {
  initialRole?: Role | null;
  next?: string;
}) {
  const router = useRouter();
  const [role, setRole] = useState<Role | null>(initialRole ?? null);
  const [busy, setBusy] = useState(false);

  function proceed() {
    if (!role || busy) return;
    setBusy(true);
    const qs = new URLSearchParams({ role });
    if (next) qs.set("next", next);
    router.push(`/signup/details?${qs.toString()}`);
  }

  return (
    <div>
      <h1 className="text-[26px] font-extrabold tracking-tight text-ink-900">
        Create your account
      </h1>
      <p className="mt-1.5 text-[14px] text-ink-500">
        Tell us what you&apos;re here for. You can always add a shop later.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {CARDS.map((c) => {
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
                  "grid h-9 w-9 place-items-center rounded-xl text-[18px] leading-none",
                  active ? "bg-brand-500" : "bg-slate-100",
                )}
                aria-hidden="true"
              >
                {c.emoji}
              </span>
              <p className="mt-2 text-[14.5px] font-bold leading-snug text-ink-900">
                {c.title}
              </p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-ink-500">{c.body}</p>
              <span
                className={cn(
                  "absolute right-3 top-3 grid h-[18px] w-[18px] place-items-center rounded-full border-2",
                  active ? "border-brand-500 bg-brand-500 text-white" : "border-slate-300",
                )}
              >
                {active && (
                  <svg
                    viewBox="0 0 24 24"
                    className="h-2.5 w-2.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={3.5}
                  >
                    <path d="m5 13 4 4L19 7" />
                  </svg>
                )}
              </span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={proceed}
        disabled={!role || busy}
        className="nm-btn-primary mt-6 w-full !py-3"
      >
        {busy ? <Spinner /> : null}
        Continue
      </button>

      <p className="mt-5 text-center text-[13px] text-ink-500">
        Already have an account?{" "}
        <Link href="/auth" className="font-semibold text-brand-600 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
