"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SignIn, useAuth } from "@clerk/nextjs";
import { signInAction } from "@/app/auth/actions";
import { Alert, Spinner } from "@/components/ui";

/**
 * The sign-in form.
 *
 * ── Two steps, and why they are separate ────────────────────────────────────
 * Clerk's `<SignIn />` owns step one: it collects the credential, runs MFA if
 * the account has it, and writes the Clerk session cookie. It cannot do step
 * two, because step two is a Jova concern — minting the Supabase session that
 * every RLS policy reads `auth.uid()` from.
 *
 * So this component watches for Clerk to report a signed-in user, then calls
 * `signInAction`, which runs the bridge on the server. Only after the bridge
 * says the Supabase session is real does the browser navigate. That ordering is
 * the whole point: navigating first is what produced the old "bounced back to
 * /auth" bug, because the destination page's guard ran before the cookie was
 * readable.
 *
 * ── Why `routing="hash"` ────────────────────────────────────────────────────
 * Path routing would need Clerk's catch-all routes mounted under `/auth`, which
 * would put Clerk's own URLs in front of the marketplace's. Hash routing keeps
 * the whole flow on this one page, so the site keeps its own look and its own
 * `?next=` handling.
 */
export function SignInForm({ next }: { next?: string }) {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const [pending, startTransition] = useTransition();

  const [bridging, setBridging] = useState(false);
  const [err, setErr] = useState("");
  const started = useRef(false);

  const working = bridging || pending;

  useEffect(() => {
    // Clerk has not resolved yet, or the person is still on Clerk's form.
    if (!isLoaded || !isSignedIn) return;

    // Guard against React's double-invoked effects in development: the bridge
    // mints a session, and running it twice would mint two.
    if (started.current) return;
    started.current = true;

    let cancelled = false;
    setBridging(true);
    setErr("");

    (async () => {
      const formData = new FormData();
      if (next) formData.set("next", next);

      let result: Awaited<ReturnType<typeof signInAction>>;
      try {
        result = await signInAction(formData);
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

      // The Supabase session is confirmed. Navigate, then refresh so the
      // destination renders with the new cookie rather than a cached
      // anonymous tree.
      startTransition(() => {
        router.replace(result.next ?? "/");
        router.refresh();
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, next, router]);

  // ── Finishing the Jova session ────────────────────────────────────────────
  if (isSignedIn || working) {
    return (
      <div>
        <h1 className="text-[26px] font-extrabold tracking-tight text-ink-900">
          Welcome back
        </h1>
        <p className="mt-1.5 text-[13.5px] text-ink-500">
          Setting up your session…
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
            <Spinner /> Signing you in…
          </div>
        )}
      </div>
    );
  }

  // ── Clerk's credential step ───────────────────────────────────────────────
  return (
    <div>
      <h1 className="text-[26px] font-extrabold tracking-tight text-ink-900">
        Welcome back
      </h1>
      <p className="mt-1.5 text-[13.5px] text-ink-500">
        Sign in to track orders, chats and payouts.
      </p>

      <div className="mt-6">
        <SignIn
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
        New to Jova?{" "}
        <Link href="/signup" className="font-semibold text-brand-600 hover:underline">
          Create an account
        </Link>
      </p>

      <p className="mt-6 text-center text-[11.5px] leading-relaxed text-ink-400">
        By continuing you agree to our{" "}
        <Link href="/legal/terms" className="underline underline-offset-2 hover:text-ink-700">
          Terms
        </Link>{" "}
        and{" "}
        <Link href="/legal/refunds" className="underline underline-offset-2 hover:text-ink-700">
          Refund Policy
        </Link>
        .
      </p>
    </div>
  );
}
