"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import { bridgeClerkSession } from "@/app/auth/clerk-actions";
import { Spinner, Alert } from "@/components/ui";
import { CLERK_CONFIGURED } from "@/lib/clerk/config";

export default function AuthContinuePage() {
  if (!CLERK_CONFIGURED) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col justify-center px-4">
        <div className="nm-card p-6 text-center">
          <h1 className="text-[20px] font-extrabold tracking-tight text-ink-900">
            Sign-in is not configured
          </h1>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-500">
            This deployment has no Clerk publishable key yet.
          </p>
          <Link href="/" className="nm-btn-primary mt-5 w-full py-3">
            Back to the marketplace
          </Link>
        </div>
      </div>
    );
  }

  return (
    <Suspense fallback={<div className="mx-auto flex min-h-screen items-center justify-center"><Spinner /></div>}>
      <AuthContinueInner />
    </Suspense>
  );
}

function AuthContinueInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signOut } = useClerk();
  const started = useRef(false);
  const [error, setError] = useState("");

  const mode = searchParams.get("mode") === "signup" ? "signup" : "signin";
  const role = searchParams.get("role") === "seller" ? "seller" : "buyer";
  const rawNext = searchParams.get("next") ?? "";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : null;

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    (async () => {
      try {
        const result = await bridgeClerkSession({ mode, role, next });
        if (!result.ok) {
          await signOut();
          const back = new URLSearchParams();
          if (result.noAccount) back.set("noaccount", "1");
          else if (result.existing) back.set("existing", "1");
          if (back.toString()) {
            const base = mode === "signup" ? "/signup" : "/auth";
            router.replace(base + "?" + back.toString());
            return;
          }
          setError(result.error);
          return;
        }
        router.replace(result.next);
        router.refresh();
      } catch (e) {
        await signOut();
        setError(e instanceof Error ? e.message : "We could not complete your sign-in. Please try again.");
      }
    })();
  }, [mode, role, next, router, signOut]);

  if (error) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col justify-center px-4">
        <div className="nm-card p-6">
          <h1 className="text-[20px] font-extrabold tracking-tight text-ink-900">Sign-in did not complete</h1>
          <div className="mt-3"><Alert tone="red">{error}</Alert></div>
          <div className="mt-5 space-y-2.5">
            <Link href="/auth" className="nm-btn-primary w-full py-3">Try again</Link>
            <Link href="/" className="nm-btn-ghost w-full py-3">Back to the marketplace</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col items-center justify-center px-4">
      <div className="nm-card flex w-full flex-col items-center gap-3 p-8">
        <Spinner className="h-6 w-6 text-brand-500" />
        <p className="text-[15px] font-semibold text-ink-900">Completing your sign-in…</p>
        <p className="text-center text-[13px] leading-relaxed text-ink-500">Setting up your Jova session. This takes a moment.</p>
      </div>
    </div>
  );
}
