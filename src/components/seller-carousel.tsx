"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ShopCard } from "@/components/cards";
import type { ShopLite } from "@/lib/queries";

/**
 * The verified-seller carousel — reference 3.
 *
 * ── What it does ────────────────────────────────────────────────────────
 * One seller per view, taking most of the page width but not all of it
 * (the card is capped and centred, so the next one peeks in at the edge
 * and the row reads as a carousel rather than a stack). It advances on
 * its own every 5 seconds, and a buyer can also swipe it or use the
 * arrows.
 *
 * ── Why the order is random but stable ──────────────────────────────────
 * The brief asks for sellers shown at random, not a fixed list. A truly
 * random order on every render would reshuffle under the buyer's finger
 * and make the carousel impossible to use, so the shuffle is seeded from
 * the visitor (see `getNearbyShops` and `stable-random.ts`): a given
 * buyer sees a given order, a different buyer sees a different one, and
 * the order does not change while they are on the page.
 *
 * ── Why it pauses ───────────────────────────────────────────────────────
 * The timer stops while the pointer is over the card, while the tab is
 * hidden, and when the OS asks for reduced motion. An auto-advancing
 * carousel that keeps moving while you are reading it is the classic
 * accessibility failure; this one only moves when nobody is looking.
 */
const INTERVAL_MS = 5000;

export function SellerCarousel({ shops }: { shops: ShopLite[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const count = shops.length;

  const go = useCallback(
    (next: number) => {
      if (count === 0) return;
      const i = ((next % count) + count) % count;
      setIndex(i);
      const track = trackRef.current;
      if (track) {
        const slide = track.children[i] as HTMLElement | undefined;
        if (slide) {
          track.scrollTo({ left: slide.offsetLeft - track.offsetLeft, behavior: "smooth" });
        }
      }
    },
    [count],
  );

  // The timer. Re-armed whenever the index changes, so a manual swipe gets
  // a full 5 seconds before the next automatic move.
  useEffect(() => {
    if (count < 2 || paused) return;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    const t = setTimeout(() => go(index + 1), INTERVAL_MS);
    return () => clearTimeout(t);
  }, [index, count, paused, go]);

  // Stop while the tab is in the background — a carousel that advances
  // through ten slides while you are in another tab is just wasted work.
  useEffect(() => {
    const onVis = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // Keep the index in step with a manual swipe.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const w = track.clientWidth;
        if (!w) return;
        const i = Math.round(track.scrollLeft / w);
        if (i >= 0 && i < count) setIndex(i);
      });
    };
    track.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      track.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [count]);

  if (count === 0) return null;

  return (
    <div
      className="relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      {/* The track. `snap-x` so a swipe lands on a card, and the negative
          margin lets the first card sit flush with the page gutter while
          the next one peeks in. */}
      <div
        ref={trackRef}
        className="nm-gal-track -mx-4 gap-4 px-4 sm:mx-0 sm:px-0"
        aria-roledescription="carousel"
        aria-label="Verified sellers"
      >
        {shops.map((s, i) => (
          <div
            key={s.id}
            className="nm-seller-slide"
            aria-hidden={i !== index}
          >
            <ShopCard s={s} wide />
          </div>
        ))}
      </div>

      {/* Controls: arrows on a wide screen, dots always. The dots are the
          same three-dot language the gallery uses, so the two carousels
          read as one system. */}
      {count > 1 && (
        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5" role="tablist" aria-label="Choose a seller">
            {shops.map((s, i) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`Seller ${i + 1} of ${count}: ${s.name}`}
                onClick={() => go(i)}
                className="nm-gal-dot"
                data-on={i === index ? "true" : "false"}
              />
            ))}
          </div>

          <div className="hidden items-center gap-2 sm:flex">
            <button
              type="button"
              onClick={() => go(index - 1)}
              aria-label="Previous seller"
              className="grid h-9 w-9 place-items-center rounded-full border border-[var(--line)] bg-white text-ink-600 shadow-card transition hover:border-brand-300 hover:text-brand-700"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="m14 6-6 6 6 6" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => go(index + 1)}
              aria-label="Next seller"
              className="grid h-9 w-9 place-items-center rounded-full border border-[var(--line)] bg-white text-ink-600 shadow-card transition hover:border-brand-300 hover:text-brand-700"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="m10 6 6 6-6 6" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
