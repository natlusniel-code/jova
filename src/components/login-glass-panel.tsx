"use client";

import Link from "next/link";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { Alert } from "@/components/ui";

/**
 * The login actions, sitting under the video behind a glass panel.
 *
 * ── Why a glass card ───────────────────────────────────────────────
 * The brief asks for "Login with Google" underneath the video with a subtle
 * glass effect, so the login screen reads as one object rather than a video
 * with a button dropped below it. The panel is translucent with a backdrop
 * blur, a hairline border and a soft top highlight — glass enough to be
 * distinctive, still legible on a phone in daylight. It overlaps the video's
 * bottom edge slightly (`-mt-7`) so the two read as joined.
 *
 * ── Why the messages come from the URL ────────────────────────────
 * The OAuth round trip leaves the app entirely. When the server refuses a
 * sign-in — no account, or an account that already exists — it comes back as
 * `?noaccount=1` / `?existing=1` and this panel renders the matching message.
 * Rendering it here, under the button that caused it, is the only place it
 * makes sense: the spinner page in the middle of the round trip has no context
 * and no link to fix anything.
 *
 * ── mode="signin" ────────────────────────────────────────────────
 * This is the LOGIN page: it must only admit accounts that already exist. A
 * Google address we have never seen is refused server-side, so this page can
 * never quietly create an account — the person is pointed at /signup instead.
 */
export function LoginGlassPanel({
  next,
  noAccount = false,
  errorMessage = "",
}: {
  next?: string;
  noAccount?: boolean;
  errorMessage?: string;
}) {
  return (
    <div className="-mt-5 px-1.5">
      <div className="relative overflow-hidden rounded-2xl border border-white/60 bg-white/60 p-5 shadow-[0_8px_32px_-8px_rgba(15,23,42,0.22)] backdrop-blur-xl backdrop-saturate-150">
        {/* The glass sheen: a faint diagonal highlight across the top-left. */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/70 via-white/10 to-white/0" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent" />

        <div className="relative">
          {errorMessage && (
            <div className="mb-3">
              <Alert tone="red" title="Sign-in did not complete">
                {errorMessage}
              </Alert>
            </div>
          )}

          {/* ── No account yet ─────────────────────────────────────────
              Someone used the login page with a Google address that has never
              signed up. Say so plainly and send them to the role choice, which
              is where a new account actually starts. */}
          {noAccount && (
            <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3">
              <p className="text-[13px] font-bold text-amber-900">
                You don&apos;t have an account yet
              </p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-amber-800">
                There is no NaijaMart account for that Google address. Create
                one first — it takes one tap.
              </p>
              <Link
                href="/signup"
                className="nm-btn-primary mt-3 w-full !py-2.5 text-[14px]"
              >
                Create an account
              </Link>
            </div>
          )}

          <GoogleSignInButton
            mode="signin"
            next={next}
            label="Login with Google"
            className="!bg-white/85 hover:!bg-white !text-ink-900 !shadow-none border !border-slate-200/80 backdrop-blur"
          />

          <p className="mt-3.5 text-center text-[11.5px] leading-relaxed text-ink-500">
            We&apos;ll use your Google name and email. Nothing is posted to Google.
          </p>
        </div>
      </div>

      <p className="mt-6 text-center text-[13px] text-ink-500">
        New to NaijaMart?{" "}
        <Link
          href="/signup"
          className="font-semibold text-brand-600 hover:underline"
        >
          Create an account
        </Link>
      </p>

      <p className="mt-5 text-center text-[11.5px] leading-relaxed text-ink-400">
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
