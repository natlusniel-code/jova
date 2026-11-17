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
 * the strip is scrollable. The strip stops at the ends — it only moves
 * when the buyer swipes (or taps an arrow / thumbnail); there is no
 * auto-swipe and no wrap from the last photo back to the first.
 *
 * A `scroll-snap` track gives the native "one photo per swipe" feel, and
 * the dots are driven by the scroll position rather than by a click, so
 * they stay correct whether the buyer swiped, dragged or used the arrows.
 *
 * ── The frame ──────────────────────────────────────────────────────────
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
  const firstImgRef = useRef<HTMLImageElement | null>(null);

  const frameRatio = natural ? "aspect-[16/10]" : PRODUCT_FRAME_ASPECT;

  /**
   * The frame takes the photo's own ratio, so the photo fills it edge to
   * edge instead of sitting letterboxed inside a taller frame.
   *
   * `onLoad` alone is not enough: browsers serve the first photo from
   * cache on a revisit, and a cached image can already be `complete`
   * before React attaches the handler, so the callback never runs and the
   * frame stays at the 4:3 fallback. Reading `complete` here covers that
   * case, and gives the same frame height on every slide so the strip
   * does not jump as the buyer swipes.
   */
  useEffect(() => {
    const img = firstImgRef.current;
    if (!img) return;

    const read = () => {
      if (img.naturalWidth > 0) {
        setPhotoRatio(productFrameRatio(img.naturalWidth, img.naturalHeight));
      }
    };

    // Already decoded (a cache hit, or the server-rendered <img> finished
    // before hydration): read it straight away.
    read();
    if (img.complete && img.naturalWidth > 0) return;

    // Otherwise listen natively. React's `onLoad` is not enough because
    // it is attached during hydration, which can be after the browser
    // already fired `load` for a cached photo.
    img.addEventListener("load", read);
    return () => img.removeEventListener("load", read);
  }, [list[0]]);

  const goTo = useCallback((i: number) => {
    const track = trackRef.current;
    if (!track) return;
    const clamped = Math.max(0, Math.min(list.length - 1, i));
    const slide = track.children[clamped] as HTMLElement | undefined;
    if (!slide) return;
    track.scrollTo({ left: slide.offsetLeft - track.offsetLeft, behavior: "smooth" });
    setActive(clamped);
  }, [list.length]);

  // Keep the active index in step with the scroll position. The strip
  // stops at the ends — no wrap-around, no auto-swipe: it only moves
  // when the buyer swipes (or taps an arrow / thumbnail).
  useEffect(() => {
    const track = trackRef.current;
    if (!track || list.length < 2) return;
    let raf = 0;

    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const w = track.clientWidth;
        if (!w) return;
        const i = Math.round(track.scrollLeft / w);
        if (i >= 0 && i < list.length) {
          setActive(i);
        }
      });
    };

    track.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      track.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
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
                  className={`w-full max-w-full overflow-hidden rounded-2xl bg-white ${photoRatio ? "" : frameRatio}`}
                  style={photoRatio ? { aspectRatio: String(photoRatio) } : undefined}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    ref={i === 0 ? firstImgRef : undefined}
                    src={src}
                    alt={`${title} — photo ${i + 1}`}
                    loading={i === 0 ? "eager" : "lazy"}
                    decoding="async"
                    draggable={false}
                    onLoad={(e) => {
                      if (i !== 0) return;
                      const img = e.currentTarget;
                      if (img.naturalWidth > 0) {
                        setPhotoRatio(productFrameRatio(img.naturalWidth, img.naturalHeight));
                      }
                    }}
                    className={`block h-full w-full max-h-full max-w-full select-none ${PRODUCT_FRAME_FIT}`}
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Arrows — a wide screen has no swipe gesture, so it gets real
            buttons. They stop at the ends (no wrap). */}
        {list.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => goTo(active - 1)}
              aria-label="Previous photo"
              disabled={active === 0}
              className="absolute left-2 top-1/2 hidden h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-ink-700 shadow-lift backdrop-blur transition hover:bg-white disabled:opacity-40 sm:grid"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="m14 6-6 6 6 6" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => goTo(active + 1)}
              aria-label="Next photo"
              disabled={active === list.length - 1}
              className="absolute right-2 top-1/2 hidden h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-ink-700 shadow-lift backdrop-blur transition hover:bg-white disabled:opacity-40 sm:grid"
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
          Tapping the left or right dot moves one photo that way and stops
          at the ends, matching the swipe.

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
            onClick={() => goTo(active - 1)}
            disabled={active === 0}
            className="nm-gal-dot disabled:opacity-30"
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
            onClick={() => goTo(active + 1)}
            disabled={active === list.length - 1}
            className="nm-gal-dot disabled:opacity-30"
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
