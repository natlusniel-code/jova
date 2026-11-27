"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SignIn, useAuth } from "@clerk/nextjs";
import { adminSignInAction } from "@/app/admin-fuckliving/login/actions";
import { Spinner, Alert } from "@/components/ui";

/**
 * The admin sign-in form.
 *
 * ── What changed ────────────────────────────────────────────────────────────
 * The email and password fields are gone. Clerk's `<SignIn />` collects the
 * credential, so the console no longer has its own password store — a staff
 * member's password is the same one Clerk holds, and a reset in Clerk takes
 * effect here immediately.
 *
 * ── What is kept ────────────────────────────────────────────────────────────
 * No sign-up link, no social provider, no "forgot password" flow that would
 * leak whether an address is staff. Clerk's component is configured to show
 * only what a staff door should show.
 *
 * ── Why the two steps are separate ──────────────────────────────────────────
 * Clerk proves the identity; `adminSignInAction` mints the Supabase session and
 * then checks `admin_users`. Only after both does the browser navigate — so a
 * non-admin never reaches the console, and an admin never lands on a page whose
 * guard ran before the cookie existed.
 */
export function AdminLoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "";

  const { isLoaded, isSignedIn } = useAuth();
  const [err, setErr] = useState("");
  const [bridging, setBridging] = useState(false);
  const [pending, startTransition] = useTransition();
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
      const fd = new FormData();
      if (next) fd.set("next", next);

      let result: Awaited<ReturnType<typeof adminSignInAction>>;
      try {
        result = await adminSignInAction(fd);
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
        router.push(result.next);
        router.refresh();
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, next, router]);

  // ── Finishing the console session ─────────────────────────────────────────
  if (isSignedIn || working) {
    return (
      <div className="space-y-3">
        {err ? (
          <>
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
          </>
        ) : (
          <div className="flex items-center gap-2.5 py-2 text-[13.5px] text-ink-500">
            <Spinner /> Checking your access…
          </div>
        )}
      </div>
    );
  }

  // ── Clerk's credential step ───────────────────────────────────────────────
  return (
    <div>
      <SignIn
        routing="hash"
        appearance={{
          elements: {
            rootBox: "w-full",
            card: "shadow-none p-0 bg-transparent",
            headerTitle: "hidden",
            headerSubtitle: "hidden",
            // A staff door offers no self-service signup and no social login.
            socialButtons: "hidden",
            socialButtonsBlockButton: "hidden",
            dividerRow: "hidden",
            footer: "hidden",
            formButtonPrimary: "nm-btn-primary",
          },
        }}
      />
    </div>
  );
}
