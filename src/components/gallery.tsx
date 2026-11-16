"use client";

import { useState } from "react";
import { BlurredFrame } from "@/components/blurred-frame";
import {
  PRODUCT_FRAME_ASPECT,
  PRODUCT_FRAME_FIT,
  productFrameRatio,
} from "@/lib/image-frame";

/**
 * The listing image gallery.
 *
 * ── One frame, every photo ────────────────────────────────────────────
 * The frame's width comes from its column and its height from
 * `aspect-ratio`, so a 4000x600 panorama and a 600x4000 portrait both land in
 * a landscape box. The file's pixel size never widens the document — that was
 * the original bug, where one wide upload widened the whole document and
 * pushed the sticky header's icons off-screen.
 *
 * ── Service photos ────────────────────────────────────────────────────
 * A gig is shown through `BlurredFrame`: the artwork is never cropped, and
 * the space it does not fill is covered by a blurred copy of itself instead
 * of flat bars or a repeating tile. See that component for why.
 *
 * A product photo stays in the plain frame, but it is fitted with
 * `object-contain` rather than cropped: the buyer must see the whole photo the
 * seller uploaded, not a centre crop of it. The frame itself is landscape and
 * takes the photo's own ratio (see `@/lib/image-frame`), so the photo fills it
 * with no empty space around it. The frame carries a small green glass
 * outline (`.nm-photo-glass`) so it reads as a deliberate surface.
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
  const [active, setActive] = useState(0);
  const list = images.length ? images : [];

  // The product frame takes the seller's photo's own landscape ratio, so the
  // photo fills it with no empty space around it. `null` until the photo has
  // loaded, in which case the fallback landscape class is used.
  const [photoRatio, setPhotoRatio] = useState<number | null>(null);

  // A product uses the seller's own upload frame — landscape, sized to the
  // photo itself. A service keeps its wide 16:10 frame (see BlurredFrame).
  const frameRatio = natural ? "aspect-[16/10]" : PRODUCT_FRAME_ASPECT;

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
      {natural ? (
        <BlurredFrame
          src={list[active]}
          alt={title}
          aspectClass={frameRatio}
          priority
        />
      ) : (
        <div
          className={`nm-photo-glass w-full max-w-full overflow-hidden rounded-2xl border border-[var(--line)] bg-slate-100 ${frameRatio}`}
          style={
            !natural && photoRatio ? { aspectRatio: String(photoRatio) } : undefined
          }
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={list[active]}
            alt={title}
            loading="eager"
            decoding="async"
            onLoad={(e) => {
              const img = e.currentTarget;
              setPhotoRatio(productFrameRatio(img.naturalWidth, img.naturalHeight));
            }}
            className={`block h-full w-full max-h-full max-w-full ${PRODUCT_FRAME_FIT}`}
          />
        </div>
      )}

      {list.length > 1 && (
        <div className="nm-scroll mt-2 flex max-w-full gap-2 overflow-x-auto">
          {list.map((src, i) => (
            <button
              key={i}
              onClick={() => {
                setPhotoRatio(null);
                setActive(i);
              }}
              className={`shrink-0 overflow-hidden rounded-xl border-2 transition ${
                natural ? "h-14 w-24" : "h-16 w-16"
              } ${i === active ? "border-brand-500" : "border-transparent opacity-70 hover:opacity-100"}`}
              aria-label={`Image ${i + 1}`}
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
