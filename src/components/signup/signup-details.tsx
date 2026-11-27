"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SignUp, useAuth } from "@clerk/nextjs";
import { signUpAction } from "@/app/auth/actions";
import { Alert, Spinner } from "@/components/ui";

type Role = "buyer" | "seller";

/**
 * The sign-up details form — step two, after the role is chosen.
 *
 * ── What is kept from the original design ───────────────────────────────────
 * The same page, the same heading, the same role chip with its "Change" link,
 * the same "Already have an account? Sign in" footer. Only the plumbing
 * underneath changed.
 *
 * ── What is NOT kept ────────────────────────────────────────────────────────
 * The name/email/password fields. Clerk's `<SignUp />` collects them, because
 * Clerk is the credential store now — it also handles the email verification
 * step, which the old form did not have at all. Duplicating those inputs here
 * would mean two sources of truth for a password.
 *
 * ── Why the role is still shown ─────────────────────────────────────────────
 * It was settled on the previous step and travels in the URL. It is displayed
 * as a chip with a link back, so a wrong choice is one tap to fix rather than a
 * dead end — and it is passed to the bridge, which writes it to
 * `public.profiles`. The role is a marketplace fact, not an identity fact, so
 * Clerk never sees it.
 */
export function SignupDetails({
  role,
  next,
}: {
  role: Role;
  next?: string;
}) {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const [pending, startTransition] = useTransition();

  const [bridging, setBridging] = useState(false);
  const [err, setErr] = useState("");
  const started = useRef(false);

  const working = bridging || pending;

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    if (started.current) return;
    started.current = true;

    let cancelled = false;
    setBridging(true);
    setErr("");

    (async () => {
      const formData = new FormData();
      formData.set("role", role);
      if (next) formData.set("next", next);

      let result: Awaited<ReturnType<typeof signUpAction>>;
      try {
        result = await signUpAction(formData);
      } catch {
        if (cancelled) return;
        setBridging(false);
        started.current = false;
        setErr("We couldn't reach the server. Check your connection and try again.");
        return;
      }

      if (cancelled) return;

      if (!result.ok) {
        setBridging(false);
        started.current = false;
        setErr(result.error);
        return;
      }

      startTransition(() => {
        router.replace(result.next ?? "/");
        router.refresh();
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, role, next, router]);

  // ── Finishing the Jova account ────────────────────────────────────────────
  if (isSignedIn || working) {
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

        {err ? (
          <div className="mt-6 space-y-3">
            <Alert tone="red">{err}</Alert>
            <button
              type="button"
              onClick={() => {
                started.current = false;
                setErr("");
                setBridging(false);
              }}
              className="nm-btn-primary w-full !py-3"
            >
              Try again
            </button>
          </div>
        ) : (
          <div className="mt-8 flex items-center gap-2.5 text-[13.5px] text-ink-500">
            <Spinner /> Creating your account…
          </div>
        )}
      </div>
    );
  }

  // ── Clerk's credential step ───────────────────────────────────────────────
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

      <div className="mt-5">
        <SignUp
          routing="hash"
          appearance={{
            elements: {
              rootBox: "w-full",
              card: "shadow-none p-0 bg-transparent",
              headerTitle: "hidden",
              headerSubtitle: "hidden",
              socialButtonsBlockButton: "nm-btn-secondary",
              formButtonPrimary: "nm-btn-primary",
              footer: "hidden",
            },
          }}
        />
      </div>

      <p className="mt-5 text-center text-[13px] text-ink-500">
        Already have an account?{" "}
        <Link href="/auth" className="font-semibold text-brand-600 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
