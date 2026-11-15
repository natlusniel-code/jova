import Link from "next/link";
import { Logo } from "@/components/ui";
import { VerifyEmail } from "@/components/signup/verify-email";

export const metadata = { title: "Confirm your account" };

/**
 * `/signup/verify?email=…` — the step after a successful signup.
 *
 * A thin server shell around the client component, which does the actual
 * work: ask Appwrite to mail a code, then confirm the code the person types
 * back. The address travels in the query string because the send and the
 * confirm are two page loads and nothing authorises on it — the code does.
 */
export default function VerifyPage({
  searchParams,
}: {
  searchParams: { email?: string; role?: string };
}) {
  const email = searchParams.email ?? "";
  const role = searchParams.role ?? "buyer";

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <div className="px-4 py-4">
        <Logo />
      </div>

      <div className="flex flex-1 items-start justify-center px-4 pb-16 pt-6 sm:pt-16">
        {email ? (
          <VerifyEmail email={email} role={role} />
        ) : (
          <div className="mx-auto w-full max-w-[420px] text-center">
            <h1 className="text-[24px] font-extrabold tracking-tight text-ink-900">
              Let&apos;s confirm your email
            </h1>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-500">
              We need the address you signed up with to send your code. Start
              the sign-up again and it will be sent automatically.
            </p>
            <Link href="/signup" className="nm-btn-primary mt-6 block w-full py-3">
              Create an account
            </Link>
            <Link href="/signin" className="nm-btn-ghost mt-2.5 block w-full py-3">
              Go to sign in
            </Link>
          </div>
        )}
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
