import Link from "next/link";
import { Logo } from "@/components/ui";

export const metadata = { title: "Confirm your email" };

/**
 * `/auth/verify` — where an unconfirmed person is sent to finish signing up.
 *
 * ── Why this is no longer a link landing page ─────────────────────────────
 * Verification used to be a link: the email carried a token, and opening it
 * consumed the token on the server. Appwrite's built-in SMTP now sends a
 * 6-digit code instead, so there is no link to land on and no token in the
 * URL. The code is entered on `/signup/verify`, which is where the send and
 * the confirm both live.
 *
 * This route is kept because it is the address already printed in older
 * emails and bookmarked by users. Rather than 404 them, it explains the
 * change and points at the screen that works.
 */
export default function VerifyEmailPage() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <div className="px-4 py-4">
        <Logo />
      </div>

      <div className="flex flex-1 items-start justify-center px-4 pb-16 pt-6 sm:pt-16">
        <div className="mx-auto w-full max-w-[420px] text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-brand-50">
            <svg
              viewBox="0 0 24 24"
              className="h-8 w-8 text-brand-600"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.7}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="5" width="18" height="14" rx="2.2" />
              <path d="m3.5 7 8.5 6 8.5-6" />
            </svg>
          </div>

          <h1 className="mt-5 text-[24px] font-extrabold tracking-tight text-ink-900">
            Confirm your email with a code
          </h1>
          <p className="mx-auto mt-1.5 max-w-[340px] text-[13.5px] leading-relaxed text-ink-500">
            We now send a 6-digit code instead of a link. Sign in and we will
            take you to the screen where you can enter it — or ask for a fresh
            code there.
          </p>

          <Link href="/signin" className="nm-btn-primary mt-6 block w-full py-3">
            Go to sign in
          </Link>
          <Link href="/signup" className="nm-btn-ghost mt-2.5 block w-full py-3">
            Create a new account
          </Link>
        </div>
      </div>

      <div className="px-4 pb-8 text-center text-[11.5px] text-ink-400">
        By continuing you agree to our{" "}
        <Link href="/legal/terms" className="underline">
          Terms
        </Link>{" "}
        and{" "}
        <Link href="/legal/refunds" className="underline">
          Refund Policy
        </Link>
        .
      </div>
    </div>
  );
}
