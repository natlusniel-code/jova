"use client";

import Link from "next/link";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { Alert } from "@/components/ui";

/**
 * The login actions.
 *
 * ── Google is the ONLY way in ─────────────────────────────────────────
 * There is deliberately no email field, no password field and no
 * "forgot password" link on this page. Google is the single identity
 * provider, so the page has exactly one action and nothing to get wrong.
 * Do not add an email form here: the server-side OAuth callback is the
 * only path that creates a session, and an email form would be a dead
 * end that looks like a working login.
 *
 * ── Why the messages come from the URL ────────────────────────────────
 * The OAuth round trip leaves the app entirely. When the server refuses a
 * sign-in — no account, or an account that already exists — it comes back
 * as `?noaccount=1` / `?existing=1` and this panel renders the matching
 * message. Rendering it here, under the button that caused it, is the only
 * place it makes sense: the spinner page in the middle of the round trip
 * has no context and no link to fix anything.
 *
 * ── mode="signin" ─────────────────────────────────────────────────────
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
    <div>
      {/* ── Heading ─────────────────────────────────────────────────── */}
      <div className="mb-7">
        <h2 className="font-display text-[27px] font-extrabold tracking-[-0.035em] text-ink-900">
          Welcome back
        </h2>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-500">
          Sign in with the Google account you used to join Jova.
        </p>
      </div>

      {errorMessage && (
        <div className="mb-5">
          <Alert tone="red" title="Sign-in did not complete">
            {errorMessage}
          </Alert>
        </div>
      )}

      {/* ── No account yet ──────────────────────────────────────────────
          Someone used the login page with a Google address that has never
          signed up. Say so plainly and send them to the role choice, which
          is where a new account actually starts. */}
      {noAccount && (
        <div className="mb-5 rounded-[16px] border border-[#f2d9a8] bg-[#fdf7ec] px-4 py-4">
          <p className="text-[13.5px] font-bold text-[#7a4f08]">You don&apos;t have an account yet</p>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-[#8a5a0b]">
            There is no Jova account for that Google address. Create one first — it takes one
            tap.
          </p>
          <Link href="/signup" className="nm-btn-primary mt-3.5 w-full">
            Create an account
          </Link>
        </div>
      )}

      {/* ── The one action ──────────────────────────────────────────── */}
      <GoogleSignInButton
        mode="signin"
        next={next}
        label="Continue with Google"
        className="!h-[52px] !rounded-[15px] !text-[15px]"
      />

      <p className="mt-4 flex items-center justify-center gap-1.5 text-[11.5px] text-ink-400">
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <rect x="4.5" y="10.5" width="15" height="9.5" rx="2.5" />
          <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
        </svg>
        We never see or store your Google password.
      </p>

      {/* ── Divider ─────────────────────────────────────────────────── */}
      <div className="my-7 flex items-center gap-3">
        <span className="h-px flex-1 bg-[var(--line)]" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-400">or</span>
        <span className="h-px flex-1 bg-[var(--line)]" />
      </div>

      <p className="text-center text-[13px] text-ink-500">
        New to Jova?{" "}
        <Link href="/signup" className="font-bold text-brand-600 hover:underline">
          Create an account
        </Link>
      </p>

      <p className="mt-8 text-center text-[11.5px] leading-relaxed text-ink-400">
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
