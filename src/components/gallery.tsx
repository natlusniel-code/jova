"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BlurredFrame } from "@/components/blurred-frame";
import {
  PRODUCT_FRAME_ASPECT,
  PRODUCT_FRAME_FIT,
  productFrameRatio,
} from "@/lib/image-frame";

/**
 * The listing image gallery — reference 4.
 *
 * ── What changed ────────────────────────────────────────────────────────
 * The old gallery was a single frame plus a row of thumbnails: the only
 * way to see the next photo was to tap its thumbnail. The brief asks for
 * the photos to be swipeable directly, with three dots underneath saying
 * the strip is scrollable, and for the scroll to be infinite — swiping
 * past the last photo returns to the first, and swiping back from the
 * first lands on the last.
 *
 * ── How the infinite scroll works ───────────────────────────────────────
 * The track holds the real photos once, and the component watches the
 * scroll position. When the buyer reaches the end and keeps going, it
 * jumps to the start; when they reach the start and keep going, it jumps
 * to the end. The jump is done with `scrollTo` on the same frame, so it
 * is invisible — there is no clone of the first slide to flash past.
 *
 * A `scroll-snap` track gives the native "one photo per swipe" feel, and
 * the dots are driven by the scroll position rather than by a click, so
 * they stay correct whether the buyer swiped, dragged or used the arrows.
 *
 * ── The frame ───────────────────────────────────────────────────────────
 * A product photo keeps the seller's own landscape ratio and is fitted
 * with `object-contain`, so the whole photo is visible and never cropped.
 * A service photo goes through `BlurredFrame`, which fills the space it
 * does not cover with a blurred copy of itself.
 */
export function Gallery({
  images,
  title,
  natural = false,
}: {
  images: string[];
  title: string;
  /** Service mode: blurred surround + 16:10, instead of a square product crop. */
  natural?: boolean;
}) {
  const list = images.length ? images : [];
  const [active, setActive] = useState(0);
  const [photoRatio, setPhotoRatio] = useState<number | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  /** Guards the wrap-around so a programmatic jump does not re-trigger it. */
  const wrapping = useRef(false);
  /** True once the buyer has moved off the first slide at least once. */
  const armed = useRef(false);

  const frameRatio = natural ? "aspect-[16/10]" : PRODUCT_FRAME_ASPECT;

  const goTo = useCallback((i: number) => {
    const track = trackRef.current;
    if (!track) return;
    const slide = track.children[i] as HTMLElement | undefined;
    if (!slide) return;
    track.scrollTo({ left: slide.offsetLeft - track.offsetLeft, behavior: "smooth" });
    setActive(i);
  }, []);

  // Keep the active index in step with the scroll position, and wrap
  // around at either end.
  useEffect(() => {
    const track = trackRef.current;
    if (!track || list.length < 2) return;
    let raf = 0;
    let settle: ReturnType<typeof setTimeout> | null = null;

    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (wrapping.current) return;
        const w = track.clientWidth;
        if (!w) return;
        const i = Math.round(track.scrollLeft / w);
        if (i >= 0 && i < list.length) {
          setActive(i);
          if (i > 0) armed.current = true;
        }
      });
    };

    // The wrap. Reaching the very end means the buyer swiped past the last
    // photo; reaching 0 after having been elsewhere means they swiped back
    // past the first. Both jump to the other end on the same frame.
    const settleAt = () => {
      if (wrapping.current) return;
      const w = track.clientWidth;
      if (!w) return;
      const max = track.scrollWidth - w;
      if (max <= 0) return;

      if (track.scrollLeft >= max - 2) {
        wrapping.current = true;
        track.scrollTo({ left: 0, behavior: "auto" });
        setActive(0);
        setTimeout(() => (wrapping.current = false), 80);
      } else if (track.scrollLeft <= 2 && armed.current) {
        wrapping.current = true;
        track.scrollTo({ left: max, behavior: "auto" });
        setActive(list.length - 1);
        setTimeout(() => (wrapping.current = false), 80);
      }
    };

    const debounced = () => {
      if (settle) clearTimeout(settle);
      settle = setTimeout(settleAt, 150);
    };

    track.addEventListener("scroll", onScroll, { passive: true });
    track.addEventListener("scroll", debounced, { passive: true });
    track.addEventListener("scrollend", settleAt as EventListener);

    return () => {
      track.removeEventListener("scroll", onScroll);
      track.removeEventListener("scroll", debounced);
      track.removeEventListener("scrollend", settleAt as EventListener);
      cancelAnimationFrame(raf);
      if (settle) clearTimeout(settle);
    };
  }, [list.length]);

  if (!list.length) {
    return (
      <div
        className={`w-full max-w-full overflow-hidden rounded-2xl border border-[var(--line)] bg-slate-100 ${frameRatio}`}
      >
        <div className="grid h-full place-items-center text-5xl text-slate-300">📦</div>
      </div>
    );
  }

  return (
    <div className="min-w-0 max-w-full">
      {/* ── The swipeable track ─────────────────────────────────────── */}
      <div className="relative">
        <div
          ref={trackRef}
          className="nm-gal-track w-full max-w-full overflow-hidden rounded-2xl"
          aria-roledescription="carousel"
          aria-label={`${title} photos`}
        >
          {list.map((src, i) => (
            <div key={i} className="nm-gal-slide">
              {natural ? (
                <BlurredFrame
                  src={src}
                  alt={`${title} — photo ${i + 1}`}
                  aspectClass={frameRatio}
                  priority={i === 0}
                />
              ) : (
                <div
                  className={`nm-photo-glass w-full max-w-full overflow-hidden rounded-2xl border border-[var(--line)] bg-slate-100 ${frameRatio}`}
                  style={photoRatio && i === active ? { aspectRatio: String(photoRatio) } : undefined}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt={`${title} — photo ${i + 1}`}
                    loading={i === 0 ? "eager" : "lazy"}
                    decoding="async"
                    draggable={false}
                    onLoad={(e) => {
                      if (i !== 0) return;
                      const img = e.currentTarget;
                      setPhotoRatio(productFrameRatio(img.naturalWidth, img.naturalHeight));
                    }}
                    className={`block h-full w-full max-h-full max-w-full select-none ${PRODUCT_FRAME_FIT}`}
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Arrows — a wide screen has no swipe gesture, so it gets real
            buttons. They wrap too, so the loop is reachable by click. */}
        {list.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => goTo((active - 1 + list.length) % list.length)}
              aria-label="Previous photo"
              className="absolute left-2 top-1/2 hidden h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-ink-700 shadow-lift backdrop-blur transition hover:bg-white sm:grid"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="m14 6-6 6 6 6" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => goTo((active + 1) % list.length)}
              aria-label="Next photo"
              className="absolute right-2 top-1/2 hidden h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-ink-700 shadow-lift backdrop-blur transition hover:bg-white sm:grid"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="m10 6 6 6-6 6" />
              </svg>
            </button>
          </>
        )}
      </div>

      {/* ── The dots ──────────────────────────────────────────────────
          Exactly three, as the reference draws them. They are a scroll
          affordance, not a position map: the left dot means "there are
          photos before this one", the middle is always filled (you are
          looking at a photo), and the right means "there are photos after".
          Tapping the left or right dot moves one photo that way, and
          because the strip is infinite neither ever runs out.

          Three dots rather than one per photo is deliberate: a listing
          with twelve photos would otherwise draw twelve dots, which is
          noise, and the reference is explicit about three. The count is
          still available to a screen reader through the slide's own
          label. */}
      {list.length > 1 && (
        <div className="mt-3 flex items-center justify-center gap-1.5">
          <button
            type="button"
            aria-label="Previous photo"
            onClick={() => goTo((active - 1 + list.length) % list.length)}
            className="nm-gal-dot"
            data-on="false"
          />
          <span
            className="nm-gal-dot"
            data-on="true"
            role="status"
            aria-label={`Photo ${active + 1} of ${list.length}`}
          />
          <button
            type="button"
            aria-label="Next photo"
            onClick={() => goTo((active + 1) % list.length)}
            className="nm-gal-dot"
            data-on="false"
          />
        </div>
      )}

      {/* ── Thumbnails ────────────────────────────────────────────────
          Kept as a secondary way in: a buyer who wants photo 5 specifically
          should not have to swipe four times. They are smaller and quieter
          than the dots so the dots stay the primary indicator. */}
      {list.length > 1 && (
        <div className="nm-scroll mt-2.5 flex max-w-full gap-2 overflow-x-auto">
          {list.map((src, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              className={`shrink-0 overflow-hidden rounded-xl border-2 transition ${
                natural ? "h-12 w-20" : "h-14 w-14"
              } ${i === active ? "border-brand-500" : "border-transparent opacity-60 hover:opacity-100"}`}
              aria-label={`Show photo ${i + 1}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt=""
                loading="lazy"
                decoding="async"
                className={`h-full w-full ${PRODUCT_FRAME_FIT}`}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
