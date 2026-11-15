import Link from "next/link";
import { Logo } from "@/components/ui";
import { consumeVerificationToken } from "@/lib/email/verify";

export const dynamic = "force-dynamic";
export const metadata = { title: "Confirm your email" };

/**
 * `/auth/verify?token=…` — the link in the signup email.
 *
 * ── Why this is a server component ────────────────────────────────────────
 * The token is consumed on the server, once, during the request. Doing it in
 * the browser would mean the token sat in client state and could be replayed
 * by a refresh; here the row is deleted before the page is even rendered, so
 * a second visit shows "already used" rather than confirming twice.
 *
 * ── Why it does not sign the person in ────────────────────────────────────
 * Confirming an address is not the same as proving a password. The person
 * still signs in normally afterwards, which is what the brief asks for: "after
 * verifying their email they can use the email to log in again."
 */
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  const token = (searchParams.token ?? "").trim();
  const email = token ? await consumeVerificationToken(token) : null;
  const ok = Boolean(email);

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <div className="px-4 py-4">
        <Logo />
      </div>

      <div className="flex flex-1 items-start justify-center px-4 pb-16 pt-6 sm:pt-16">
        <div className="mx-auto w-full max-w-[420px] text-center">
          <div
            className={`mx-auto grid h-16 w-16 place-items-center rounded-2xl ${
              ok ? "bg-brand-50" : "bg-red-50"
            }`}
          >
            {ok ? (
              <svg viewBox="0 0 24 24" className="h-8 w-8 text-brand-600" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-8 w-8 text-red-500" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v5M12 16.5v.01" />
              </svg>
            )}
          </div>

          {ok ? (
            <>
              <h1 className="mt-5 text-[24px] font-extrabold tracking-tight text-ink-900">
                Your email is confirmed
              </h1>
              <p className="mx-auto mt-1.5 max-w-[330px] text-[13.5px] leading-relaxed text-ink-500">
                Thank you. <strong className="font-semibold text-ink-800">{email}</strong> is now
                verified — you can sign in with it and your password.
              </p>
              <Link href="/signin" className="nm-btn-primary mt-6 w-full py-3">
                Sign in
              </Link>
            </>
          ) : (
            <>
              <h1 className="mt-5 text-[24px] font-extrabold tracking-tight text-ink-900">
                This link has expired
              </h1>
              <p className="mx-auto mt-1.5 max-w-[340px] text-[13.5px] leading-relaxed text-ink-500">
                Verification links last 48 hours and can only be used once. Sign in
                and we will send you a fresh one.
              </p>
              <Link href="/signin" className="nm-btn-primary mt-6 w-full py-3">
                Go to sign in
              </Link>
              <Link href="/signup" className="nm-btn-ghost mt-2.5 w-full py-3">
                Create a new account
              </Link>
            </>
          )}
        </div>
      </div>

      <div className="px-4 pb-8 text-center text-[11.5px] text-ink-400">
        By continuing you agree to our{" "}
        <Link href="/legal/terms" className="underline">Terms</Link> and{" "}
        <Link href="/legal/refunds" className="underline">Refund Policy</Link>.
      </div>
    </div>
  );
}
