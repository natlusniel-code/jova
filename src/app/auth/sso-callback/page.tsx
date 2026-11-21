"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { HandleSSOCallback } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { Spinner, Alert } from "@/components/ui";
import { CLERK_CONFIGURED } from "@/lib/clerk/config";
import { bridgeClerkSession } from "@/app/auth/clerk-actions";
import { safeNextPath } from "@/lib/safe-next";

/**
 * `/auth/sso-callback` — where the OAuth provider returns.
 *
 * ── What this page does ─────────────────────────────────────────────────────
 * `HandleSSOCallback` is Clerk's own component: it reads the `__clerk_…`
 * handshake parameters the provider sent back, completes the OAuth exchange,
 * and then calls `navigateToApp` with a real Clerk session in place.
 *
 * ── Why the bridge runs HERE and not on a second page ───────────────────────
 * This used to hand off to `/auth/continue`, a separate route whose only job
 * was to call the bridge and show a spinner. That extra hop was the
 * "Fetching your data" screen people got stuck on: a full page load, a client
 * effect, a server action, and a second navigation — four chances to stall,
 * and a blank spinner in between with no way out if any of them hung.
 *
 * The bridge is a Server Action, so it can be called from here directly. One
 * page load, one action, one navigation. The spinner below is the handshake
 * itself, which is unavoidable — but it is now the only wait, and it has a
 * real error state instead of spinning forever.
 *
 * ── Why the intent is re-read from the URL ──────────────────────────────────
 * The OAuth round trip leaves the app entirely, so no React state survives it.
 * `mode`, `role` and `next` were put on this URL by the panel. They are NOT
 * trusted: the server re-validates all three, and `mode` is what decides
 * whether a missing account may be created.
 */
export default function SsoCallbackPage() {
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState("");

  /**
   * Finish the sign-in: mint the Jova session, then go where the server says.
   *
   * Guarded by a ref because `HandleSSOCallback` can invoke its callback more
   * than once (a re-render, a retried handshake). Minting a session twice
   * would issue two sessions and race the cookie write.
   */
  const finish = useCallback(async () => {
    if (started.current) return;
    started.current = true;

    const params =
      typeof window === "undefined"
        ? new URLSearchParams()
        : new URLSearchParams(window.location.search);

    const mode = params.get("mode") === "signup" ? "signup" : "signin";
    const role = params.get("role") === "seller" ? "seller" : "buyer";
    const next = safeNextPath(params.get("next"));

    try {
      const result = await bridgeClerkSession({ mode, role, next });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      router.replace(result.next);
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "We could not complete your sign-in. Please try again.",
      );
    }
  }, [router]);

  // Without a Clerk key there is no provider and no handshake to complete.
  // Rendering the callback component would throw; explain what is missing.
  if (!CLERK_CONFIGURED) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col items-center justify-center px-4">
        <div className="nm-card w-full p-8 text-center">
          <p className="text-[15px] font-semibold text-ink-900">
            Sign-in is not configured
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-500">
            This deployment has no Clerk publishable key yet.
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col justify-center px-4">
        <div className="nm-card p-6">
          <h1 className="text-[20px] font-extrabold tracking-tight text-ink-900">
            Sign-in did not complete
          </h1>
          <div className="mt-3">
            <Alert tone="red">{error}</Alert>
          </div>
          <div className="mt-5 space-y-2.5">
            <Link href="/auth" className="nm-btn-primary w-full py-3">
              Try again
            </Link>
            <Link href="/" className="nm-btn-ghost w-full py-3">
              Back to the marketplace
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col items-center justify-center px-4">
      <div className="nm-card flex w-full flex-col items-center gap-3 p-8">
        <Spinner className="h-6 w-6 text-brand-500" />
        <p className="text-[15px] font-semibold text-ink-900">
          Finishing your sign-in…
        </p>
        <p className="text-center text-[13px] leading-relaxed text-ink-500">
          Confirming your identity. This takes a moment.
        </p>
      </div>

      {/* The handshake. It renders nothing visible and calls `finish` on
          success, which mints the Jova session and navigates. */}
      <HandleSSOCallback
        navigateToApp={() => {
          void finish();
        }}
        // The sign-in needs another step, such as MFA. The login page explains
        // the code option, which is the way through for this instance.
        navigateToSignIn={() => router.replace("/auth")}
        // The sign-up needs more information before it can complete.
        navigateToSignUp={() => router.replace("/signup")}
      />
    </div>
  );
}
