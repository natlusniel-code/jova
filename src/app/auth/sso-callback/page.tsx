"use client";

import { HandleSSOCallback } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui";
import { CLERK_CONFIGURED } from "@/lib/clerk/config";

/**
 * `/auth/sso-callback` — where the OAuth provider returns.
 *
 * ── What this page does ──────────────────────────────────────────────────────
 * Nothing of its own. `HandleSSOCallback` is Clerk's own component: it reads the
 * `__clerk_…` handshake parameters the provider sent back, completes the OAuth
 * exchange, and then calls one of the three callbacks below depending on what
 * the exchange produced.
 *
 * ── Why `HandleSSOCallback` and not `AuthenticateWithRedirectCallback` ───────
 * Clerk 7 replaced the old `signIn.authenticateWithRedirect()` call with
 * `signIn.sso()`, and the two are paired with different callback components.
 * `AuthenticateWithRedirectCallback` belongs to the old API; the new flow
 * finishes through `HandleSSOCallback`. Using the old component with the new
 * call leaves the handshake half-finished — the person comes back from Google
 * with no session and no error.
 *
 * ── Why the intent is re-read from the URL ───────────────────────────────────
 * The OAuth round trip leaves the app entirely, so no React state survives it.
 * `mode`, `role` and `next` were put on this URL by the panel, and this page
 * forwards them on to `/auth/continue`, which is where the Supabase session is
 * actually minted. They are NOT trusted here — the server re-validates all
 * three, and `mode` is what decides whether a missing account may be created.
 *
 * ── Why it is a separate route ───────────────────────────────────────────────
 * Clerk requires a stable URL to register as the redirect target, and the
 * handshake must be handled by a client component. Keeping it separate from
 * `/auth/continue` means the handshake and the session bridge are two distinct
 * steps: if the bridge fails, the person is already past the OAuth exchange and
 * can be shown a real error instead of being sent back to the provider.
 *
 * The spinner is what the person sees for the second or two the exchange takes.
 */
export default function SsoCallbackPage() {
  const router = useRouter();

  // Without a Clerk key there is no provider and no handshake to complete.
  // Rendering the callback component would throw; send the person to the
  // login page, which explains what is missing.
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

  /** Carry the panel's intent on to the bridge, which mints the Jova session. */
  const toBridge = () => {
    const params =
      typeof window === "undefined" ? "" : window.location.search;
    return `/auth/continue${params}`;
  };

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

      {/* The handshake. It renders nothing visible and navigates on success. */}
      <HandleSSOCallback
        // A session was created — hand off to the bridge.
        navigateToApp={({ decorateUrl }) => {
          const destination = decorateUrl(toBridge());
          if (destination.startsWith("http")) {
            window.location.href = destination;
            return;
          }
          router.replace(destination);
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
