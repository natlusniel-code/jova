/**
 * The one product-photo frame.
 *
 * ── Why this is a module and not a class string in two files ──────────────
 * The seller's upload tile and the buyer's product preview used to be written
 * independently: the upload tile was a 64×64 square, while the storefront
 * preview was `aspect-square` on a phone but widened to `aspect-[4/3]` from
 * `md` up. The same photo therefore had two different shapes depending on who
 * was looking at it, and the buyer's copy cropped the edges off with
 * `object-cover`.
 *
 * Both sides now import these constants, so the frame cannot drift again: the
 * buyer's frame is landscape and takes the photo's own ratio, with the whole
 * photo fitted inside it.
 *
 * ── Why `contain` and not `cover` ─────────────────────────────────────────
 * The brief is explicit: an uploaded image must be shown IN FULL inside a
 * fixed frame. `object-cover` fills the frame by cropping whatever does not
 * fit, which is exactly the quality loss being reported. `object-contain`
 * scales the photo down until all of it is visible and paints the leftover
 * space in the frame's own background, so the frame stays the same size no
 * matter what the seller uploaded.
 */

/** The frame's aspect ratio, as a CSS `aspect-ratio` value. */
export const PRODUCT_FRAME_RATIO = "4 / 3";

/**
 * Fallback ratio as a Tailwind class, used only until the photo's own size is
 * known. Once it loads, the frame takes the photo's real landscape ratio.
 */
export const PRODUCT_FRAME_ASPECT = "aspect-[4/3]";

/** How a photo sits inside the frame: whole photo, never cropped. */
export const PRODUCT_FRAME_FIT = "object-contain";

/**
 * The buyer's product frame is landscape and matches the seller's photo.
 *
 * The frame used to be a fixed square with `object-contain`, so a landscape
 * upload sat in the middle of it with empty bars above and below. The frame
 * now takes the photo's own ratio, so there is no leftover space around it.
 * These bounds keep it landscape: a portrait upload is shown in the narrowest
 * landscape frame instead of turning the page into a tall column.
 */
export const PRODUCT_FRAME_MIN_RATIO = 1.1;
export const PRODUCT_FRAME_MAX_RATIO = 2.4;

/**
 * The frame ratio for a photo of the given pixel size, clamped to landscape.
 * Returns `null` when the size is not known yet, so the caller keeps the
 * fallback class.
 */
export function productFrameRatio(
  width?: number | null,
  height?: number | null,
): number | null {
  if (!width || !height || width <= 0 || height <= 0) return null;
  const ratio = width / height;
  return Math.min(
    PRODUCT_FRAME_MAX_RATIO,
    Math.max(PRODUCT_FRAME_MIN_RATIO, ratio),
  );
}

/** The seller's upload tile, in pixels. Square, as a compact upload preview. */
export const PRODUCT_TILE_SIZE = 64;
