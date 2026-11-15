"use client";

import { useState } from "react";
import Link from "next/link";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { Alert } from "@/components/ui";

/**
 * The signed-out panel on `/auth`.
 *
 * Google is the primary action. The password form is still one click away —
 * the marketplace's existing accounts all sign in with a password, and removing
 * that route would lock every current user out. So this screen offers Google
 * prominently and keeps the old door open underneath.
 */
export function AuthGooglePanel() {
  const [error, setError] = useState("");

  return (
    <div>
      <h1 className="text-[26px] font-extrabold leading-tight tracking-tight text-ink-900">
        Sign in to NaijaMart
      </h1>
      <p className="mt-1.5 text-[14px] leading-relaxed text-ink-500">
        Use your Google account — no new password to remember.
      </p>

      <div className="mt-6 space-y-3">
        {error && (
          <Alert tone="red" title="Sign-in failed">
            {error}
          </Alert>
        )}

        <GoogleSignInButton onError={setError} />

        <div className="flex items-center gap-3 py-1">
          <span className="h-px flex-1 bg-[var(--line)]" />
          <span className="text-[12px] font-medium text-ink-400">or</span>
          <span className="h-px flex-1 bg-[var(--line)]" />
        </div>

        <Link href="/signin" className="nm-btn-ghost w-full py-3 text-[15px]">
          Sign in with email and password
        </Link>
      </div>

      <p className="mt-6 text-[13px] leading-relaxed text-ink-500">
        New to NaijaMart?{" "}
        <Link href="/signup" className="font-semibold text-brand-600 hover:underline">
          Create an account
        </Link>
      </p>

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
