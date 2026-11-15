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
 * ── Why the raw provider error is never printed ──
 * Appwrite sends something like
 *   {"message":"The Google OAuth2 provider returned an error: access_denied",
 *    "type":"user_oauth2_provider_error","code":424}
 * That is a JSON blob with an internal error type and a numeric code. It means
 * nothing to the person reading it and it makes the site look broken, so it is
 * reduced to one plain sentence here and the raw value is discarded. Only the
 * three cases that actually matter to a visitor are distinguished: they
 * cancelled on Google's screen, the provider could not be reached, or
 * something else went wrong.
 */
export default function AuthFailurePage({
  searchParams,
}: {
  searchParams?: { reason?: string; error?: string };
}) {
  const raw = `${searchParams?.reason ?? ""} ${searchParams?.error ?? ""}`;

  // `access_denied` is Google's code for "the person pressed Cancel or closed
  // the consent screen". It is by far the most common outcome here, and it is
  // not an error at all — so it gets its own wording rather than a warning.
  const cancelled = /access_denied|cancel|denied/i.test(raw);
  const unreachable = /network|fetch|timeout|unreachable|econn/i.test(raw);

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
            {cancelled
              ? "You closed or cancelled the Google sign-in window before it finished."
              : unreachable
                ? "We could not reach Google just now. Check your connection and try again."
                : "Google could not complete the sign-in. Please try again."}
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
