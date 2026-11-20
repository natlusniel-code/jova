"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import { bridgeClerkSession } from "@/app/auth/clerk-actions";
import { Spinner, Alert } from "@/components/ui";
import { CLERK_CONFIGURED } from "@/lib/clerk/config";

/**
 * `/auth/continue` — the last step of an OAuth sign-in.
 *
 * ── What happens here ───────────────────────────────────────────────────────
 *  1. The browser arrives from `/auth/sso-callback` holding a real Clerk
 *     session.
 *  2. This page calls `bridgeClerkSession`, which reads the identity from that
 *     session ON THE SERVER and mints the matching Supabase session cookie.
 *  3. It navigates to the destination the server chose.
 *
 * ── Why the intent travels in the query string ──────────────────────────────
 * The OAuth round trip leaves the app entirely, so no React state survives it.
 * `mode`, `role` and `next` were put in the callback URL by the panel and are
 * read back here. They are NOT trusted: the server re-validates all three, and
 * `mode` is what decides whether a missing account may be created.
 *
 * ── Why the ref guard ───────────────────────────────────────────────────────
 * React 18 StrictMode mounts effects twice in development. The bridge mints a
 * session, so running it twice would issue two sessions and could race the
 * cookie write. The ref makes it happen exactly once per page load.
 *
 * ── Why a refusal navigates instead of rendering here ───────────────────────
 * "You don't have an account yet" and "that account already exists" belong on
 * the page the person was using, under the button they pressed, next to the
 * link that resolves it. So both are sent back to their origin page as a query
 * flag rather than drawn on this spinner screen, which has no context.
 */
export default function AuthContinuePage({
  searchParams,
}: {
  searchParams?: { mode?: string; role?: string; next?: string };
}) {
  // Without a Clerk key there is no provider, so `useClerk` below would throw.
  // There is also nothing to continue — no OAuth round trip can have started.
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

  return <AuthContinueInner searchParams={searchParams} />;
}

function AuthContinueInner({
  searchParams,
}: {
  searchParams?: { mode?: string; role?: string; next?: string };
}) {
  const router = useRouter();
  const { signOut } = useClerk();
  const started = useRef(false);
  const [error, setError] = useState("");

  const mode = searchParams?.mode === "signup" ? "signup" : "signin";
  const role = searchParams?.role === "seller" ? "seller" : "buyer";
  const rawNext = searchParams?.next ?? "";
  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : null;

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    (async () => {
      try {
        const result = await bridgeClerkSession({ mode, role, next });

        if (!result.ok) {
          // The Clerk session is real but the marketplace refused it. Clear it,
          // or the next visit to /auth would silently sign them back in and
          // bounce them straight back here — a loop with no way out.
          await signOut();

          const back = new URLSearchParams();
          if (result.noAccount) back.set("noaccount", "1");
          else if (result.existing) back.set("existing", "1");

          if (back.toString()) {
            const base = mode === "signup" ? "/signup" : "/auth";
            router.replace(`${base}?${back.toString()}`);
            return;
          }

          setError(result.error);
          return;
        }

        router.replace(result.next);
        router.refresh();
      } catch (e) {
        await signOut();
        setError(
          e instanceof Error
            ? e.message
            : "We could not complete your sign-in. Please try again.",
        );
      }
    })();
  }, [mode, role, next, router, signOut]);

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
          Signing you in…
        </p>
        <p className="text-center text-[13px] leading-relaxed text-ink-500">
          Setting up your Jova session. This takes a moment.
        </p>
      </div>
    </div>
  );
}
