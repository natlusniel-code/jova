"use client";

import { useState } from "react";
import { signInWithGoogle, type GoogleAuthMode } from "@/lib/appwrite/client";
import { Spinner } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * The "Sign in with Google" primary CTA.
 *
 * ── The icon is the real Google mark ──────────────────────────────────────
 * It used to be a single flat colour (#C4C6D7) on a white chip, which read as
 * a disabled control. It is now the four-colour Google "G" — blue, green,
 * yellow, red — on a white chip, which is the mark people actually recognise
 * and the one Google's brand guidelines ask for.
 *
 * ── Why the chip stays white ──────────────────────────────────────────────
 * The four brand colours need a light background to stay legible. On the
 * brand-green button they would clash and the red would disappear. A white
 * chip inside the green button keeps the mark correct and the button still
 * reads as NaijaMart's primary action — same green, same radius, same type as
 * every other primary button on the site.
 *
 * ── Why there is no redirect here ─────────────────────────────────────────
 * `createOAuth2Token` navigates the browser itself. There is nothing to push
 * afterwards, so this component only handles the "about to leave" state and
 * the case where the call throws before navigating.
 *
 * ── mode / role ───────────────────────────────────────────────────────────
 * `mode` decides what the server does when the Google identity comes back:
 *
 *   "signin" — the account must already exist. A Google address that has
 *              never signed up is refused, so the login page cannot be used
 *              to silently create accounts.
 *   "signup" — the account is created if it does not exist, with `role`
 *              deciding where the person lands next (buyer → LGA + phone,
 *              seller → onboarding).
 *
 * Both are carried through the OAuth round trip in the success URL, because
 * the browser leaves the app entirely and comes back with no other state.
 */
export function GoogleSignInButton({
  label = "Sign in with Google",
  className,
  onError,
  mode = "signin",
  role,
}: {
  label?: string;
  className?: string;
  onError?: (message: string) => void;
  mode?: GoogleAuthMode;
  role?: "buyer" | "seller";
}) {
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    setBusy(true);
    try {
      await signInWithGoogle({ mode, role });
      // If we get here the browser is already navigating to Google. Leave the
      // spinner up: coming back to a button that flickered to "idle" would look
      // like the click did nothing.
    } catch (e) {
      setBusy(false);
      onError?.(
        e instanceof Error
          ? e.message
          : "We could not reach Google. Check your connection and try again.",
      );
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      aria-busy={busy}
      className={cn("nm-btn-primary w-full py-3 text-[15.5px]", className)}
    >
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white">
        {/* The four-colour Google "G". Each path is one brand colour, so the
            mark is correct at any size and needs no image asset. */}
        <svg
          width="18"
          height="18"
          viewBox="0 0 48 48"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            fill="#EA4335"
            d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
          />
          <path
            fill="#4285F4"
            d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
          />
          <path
            fill="#FBBC05"
            d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
          />
          <path
            fill="#34A853"
            d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
          />
        </svg>
      </span>
      <span>{busy ? "Taking you to Google…" : label}</span>
      {busy && <Spinner className="ml-0.5" />}
    </button>
  );
}
