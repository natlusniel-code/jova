"use client";

import { useState } from "react";
import { signInWithGoogle } from "@/lib/appwrite/client";
import { Spinner } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * The "Sign in with Google" primary CTA.
 *
 * ── Why the icon sits on a white chip ───────────────────────────────────────
 * The supplied Google mark is a single flat colour (#C4C6D7). Dropped straight
 * onto the brand green it would read as a disabled control. On its own white
 * chip inside the green button it stays legible and the button still reads as
 * the site's primary action — same green, same radius, same type as every other
 * primary button in NaijaMart.
 *
 * ── Why there is no redirect here ───────────────────────────────────────────
 * `createOAuth2Token` navigates the browser itself. There is nothing to push
 * afterwards, so this component only handles the "about to leave" state and
 * the case where the call throws before navigating.
 */
export function GoogleSignInButton({
  label = "Sign in with Google",
  className,
  onError,
}: {
  label?: string;
  className?: string;
  onError?: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    setBusy(true);
    try {
      await signInWithGoogle();
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
        {/* The supplied Google mark, verbatim (kebab-case attributes mapped to
            their JSX equivalents so React renders them correctly). */}
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M15.7034 7.91133C14.7554 7.02509 13.4903 6.54228 12.1813 6.56212C9.78605 6.56212 7.75176 8.14611 7.02642 10.279V10.2791C6.64183 11.3968 6.64183 12.6071 7.02642 13.7249H7.02979C7.75849 15.8545 9.78941 17.4385 12.1847 17.4385C13.4211 17.4385 14.4826 17.1285 15.3053 16.5809V16.5787C16.2735 15.9504 16.9348 14.9616 17.1406 13.8439H12.1813V10.3783H20.8414C20.9494 10.9802 21 11.5952 21 12.207C21 14.9443 20.002 17.2586 18.2655 18.826L18.2673 18.8274C16.7458 20.203 14.6576 21 12.1813 21C8.70985 21 5.53527 19.082 3.97666 16.043V16.043C2.67445 13.5 2.67445 10.5039 3.97666 7.96096H3.97668L3.97666 7.96094C5.53527 4.9186 8.70985 3.00061 12.1813 3.00061C14.4619 2.97415 16.6649 3.8141 18.3247 5.34188L15.7034 7.91133Z"
            fill="#C4C6D7"
          />
        </svg>
      </span>
      <span>{busy ? "Taking you to Google…" : label}</span>
      {busy && <Spinner className="ml-0.5" />}
    </button>
  );
}
