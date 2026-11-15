import Link from "next/link";
import { Alert } from "@/components/ui";
import { Logo } from "@/components/ui";

export const metadata = { title: "Sign-in failed" };

/**
 * `/auth/failure` — the OAuth failure callback.
 *
 * Appwrite redirects here when the provider refuses, the user cancels on
 * Google's consent screen, or the redirect URI does not match. It is a Server
 * Component: there is nothing to await and nothing to store, so it renders
 * immediately with a way back.
 *
 * The `reason` query parameter is echoed only as a short, sanitised hint — never
 * rendered as raw HTML — so a crafted link cannot inject anything into the page.
 */
export default function AuthFailurePage({
  searchParams,
}: {
  searchParams?: { reason?: string; error?: string };
}) {
  const raw = (searchParams?.reason ?? searchParams?.error ?? "").trim();
  const hint = raw.slice(0, 120);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col justify-center px-4">
      <div className="mb-6 flex justify-center">
        <Logo />
      </div>

      <div className="nm-card p-6">
        <h1 className="text-[21px] font-extrabold tracking-tight text-ink-900">
          Google sign-in did not complete
        </h1>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-500">
          Nothing was charged and no account was changed. You can try again, or
          sign in with your email and password.
        </p>

        <div className="mt-4">
          <Alert tone="amber" title="What happened">
            {hint
              ? `Google reported: ${hint}`
              : "The sign-in was cancelled or the provider could not be reached."}
          </Alert>
        </div>

        <div className="mt-5 space-y-2.5">
          <Link href="/auth" className="nm-btn-primary w-full py-3">
            Try again
          </Link>
          <Link href="/signin" className="nm-btn-ghost w-full py-3">
            Sign in with email and password
          </Link>
        </div>
      </div>
    </div>
  );
}
