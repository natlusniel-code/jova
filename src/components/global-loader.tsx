"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { subscribeLoader, resetLoader, type LoaderState } from "@/lib/global-loader";

/**
 * The one global loading indicator for the whole site.
 *
 * Rendered once in the root layout, so every route — storefront, seller hub,
 * admin console, auth pages — gets it without any page opting in.
 *
 * ── Design ───────────────────────────────────────────────────────────
 * The brief is specific: no background, just the star from the cart rolling
 * to show that something is loading. So this is not an overlay at all — there
 * is no white wash, no scrim, no full-viewport layer. It is a single star
 * pinned to the centre of the screen, turning on its own axis, and nothing
 * else. Whatever page is underneath stays fully visible and fully legible.
 *
 * The star is the exact artwork from the logo (public/jova-mark-star.png).
 *
 * ── Why it is not on screen while a message sends ────────────────────
 * A chat message is a data request, and a spinning star over the thread while
 * the buyer is typing the next line reads as the app being stuck. The store
 * never raises the indicator for a send (see `isSuppressed` in
 * src/lib/global-loader.ts), so this component has nothing to draw.
 *
 * ── Accessibility ────────────────────────────────────────────────────
 * `role="status"` with a visually-hidden label: a screen reader hears
 * "Loading" once. The star itself is `aria-hidden` — it carries no
 * information on its own. A user who has asked for reduced motion gets a
 * star that pulses softly instead of spinning.
 */
export function GlobalLoader() {
  const [s, setS] = useState<LoaderState>({
    visible: false,
    fading: false,
    failed: false,
    label: "Loading...",
    blocking: false,
  });

  useEffect(() => subscribeLoader(setS), []);

  if (!s.visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy={!s.fading}
      className={[
        // Centred, and deliberately NOT `inset-0` with a background: the
        // wrapper is a zero-size anchor at the middle of the viewport, so the
        // page underneath is neither dimmed nor tinted.
        "pointer-events-none fixed left-1/2 top-1/2 z-[9999] -translate-x-1/2 -translate-y-1/2",
        "transition-opacity duration-200",
        s.fading ? "opacity-0" : "opacity-100",
      ].join(" ")}
    >
      {s.failed ? (
        <RetryPanel />
      ) : (
        <span className="nm-loader-ring" aria-hidden="true">
          {/* The star is drawn, not an image: it has to be an outline with no
              fill, and a PNG of a solid star cannot be un-filled. `fill="none"`
              with a stroke is the whole point of the brief — the circle carries
              the brand green, the star is colourless and only its edge shows. */}
          <svg className="nm-loader-star" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M12 2.6l2.9 5.9 6.5.95-4.7 4.6 1.1 6.5L12 17.5l-5.8 3.05 1.1-6.5-4.7-4.6 6.5-.95z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </svg>
        </span>
      )}
      <span className="sr-only">{s.failed ? "Loading failed" : s.label}</span>
    </div>
  );
}

/**
 * Shown after 30s: the load is not coming back, so offer a reload.
 *
 * This one DOES get a plate — it is a decision point with a button, and a
 * button floating on bare page content is unreadable. It is the only state
 * of the loader allowed a background, and it only appears when the load has
 * already failed.
 */
function RetryPanel() {
  const router = useRouter();

  /**
   * Retry the page that failed, in place.
   *
   * `window.location.reload()` was the old handler and it is the wrong tool:
   * a full reload throws away the client router, the cart in memory and any
   * scroll position, and on a slow connection it re-downloads the whole app
   * just to retry one route. `router.refresh()` re-runs the server components
   * for the current URL, which is exactly the work that timed out.
   *
   * `resetLoader()` runs FIRST so the indicator is torn down before the
   * refresh starts — otherwise the stale `failed` state would still be on
   * screen and the user would see the retry panel over the page they just
   * retried.
   */
  function retry() {
    resetLoader();
    router.refresh();
  }

  return (
    <div className="pointer-events-auto w-[300px] rounded-2xl border border-[var(--line)] bg-white px-5 py-4 text-center shadow-[0_10px_30px_rgba(15,23,42,0.14)]">
      <p className="text-[14px] font-bold text-ink-900">This is taking too long</p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-ink-500">
        The page didn&apos;t finish loading. Check your connection and try again.
      </p>
      <button type="button" onClick={retry} className="nm-btn-primary mt-3 w-full !py-2 !text-[13px]">
        Retry
      </button>
    </div>
  );
}
