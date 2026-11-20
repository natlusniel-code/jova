"use client";

import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";
import { Spinner } from "@/components/ui";
import { CLERK_CONFIGURED } from "@/lib/clerk/config";

/**
 * `/auth/sso-callback` — where the OAuth provider returns.
 *
 * ── What this page does ─────────────────────────────────────────────────────
 * Nothing of its own. `AuthenticateWithRedirectCallback` is Clerk's own
 * component: it reads the `__clerk_…` handshake parameters the provider sent
 * back, completes the OAuth exchange, and then navigates to the
 * `redirectUrlComplete` the panel supplied — `/auth/continue`, which is where
 * the Supabase session is actually minted.
 *
 * ── Why it is a separate route ──────────────────────────────────────────────
 * Clerk requires a stable URL to register as the redirect target, and the
 * handshake must be handled by a client component. Keeping it separate from
 * `/auth/continue` means the handshake and the session bridge are two distinct
 * steps: if the bridge fails, the person is already past the OAuth exchange and
 * can be shown a real error instead of being sent back to the provider.
 *
 * The spinner is what the person sees for the second or two the exchange takes.
 */
export default function SsoCallbackPage() {
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
      <AuthenticateWithRedirectCallback
        signInForceRedirectUrl="/auth/continue"
        signUpForceRedirectUrl="/auth/continue"
      />
    </div>
  );
}
