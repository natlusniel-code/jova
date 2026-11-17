"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addToCart } from "@/lib/cart";
import { naira, cn } from "@/lib/utils";
import { Spinner } from "@/components/ui";

/**
 * The add-to-cart bar.
 *
 * ── Size and colour (sql/0049) ───────────────────────────────────────
 * When the seller has listed sizes or colours, a picker appears above the
 * quantity row. It is only rendered for the options the listing actually
 * has, so a product with no sizes shows no size row at all — which is the
 * required behaviour, not a nicety: an empty "Size" heading on every
 * listing would be noise.
 *
 * The choice is required only when the option exists. "Add to cart" is
 * disabled until both offered options are picked, with a short line
 * saying which one is missing, so the buyer is never left guessing why
 * the button does nothing. `place_order` enforces the same rule on the
 * server, so a stale cart cannot slip through.
 *
 * ── Why the picker is here and not in a modal ────────────────────────
 * A modal on "Add to cart" is the common pattern, but it hides the price
 * and the escrow line behind a tap. Inline keeps the whole decision —
 * size, colour, quantity, total — visible at once, which is what the
 * reference layout does with its own product controls.
 */
export function AddToCartBar({
  listing,
  shop,
  signedIn,
}: {
  listing: {
    id: string;
    title: string;
    price: number;
    original_price?: number | null;
    images: string[];
    type?: "product" | "service";
    fulfilment_mode?: "both" | "pickup" | "delivery" | null;
    /** Offered sizes (sql/0049). Empty or absent means no size choice. */
    sizes?: string[] | null;
    /** Offered colours (sql/0049). Empty or absent means no colour choice. */
    colors?: string[] | null;
  };
  shop: { id: string; slug: string; name: string; logo_url: string | null; city: string | null; state: string | null; delivery_fee: number; free_delivery_threshold: number | null; pickup_available: boolean; shop_address?: string | null; shop_lat?: number | null; shop_lng?: number | null };
  signedIn: boolean;
}) {
  const router = useRouter();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [busy, setBusy] = useState(false);

  const sizes = (listing.sizes ?? []).filter(Boolean);
  const colors = (listing.colors ?? []).filter(Boolean);
  const [size, setSize] = useState<string | null>(sizes.length === 1 ? sizes[0] : null);
  const [color, setColor] = useState<string | null>(colors.length === 1 ? colors[0] : null);

  const missing = sizes.length > 0 && !size ? "size" : colors.length > 0 && !color ? "colour" : null;
  const ready = !missing;

  function add(then?: "cart" | "checkout") {
    if (!ready) return;
    addToCart({
      shopId: shop.id,
      shopSlug: shop.slug,
      shopName: shop.name,
      shopLogo: shop.logo_url,
      city: shop.city ?? "",
      state: shop.state ?? "",
      deliveryFee: shop.delivery_fee,
      freeThreshold: shop.free_delivery_threshold,
      pickupAvailable: shop.pickup_available,
      pickupAddress: shop.shop_address ?? null,
      pickupLat: shop.shop_lat ?? null,
      pickupLng: shop.shop_lng ?? null,
      listingId: listing.id,
      title: listing.title,
      price: listing.price,
      originalPrice: listing.original_price ?? null,
      image: listing.images?.[0] ?? null,
      quantity: qty,
      isService: listing.type === "service",
      fulfilmentMode: listing.type === "service" ? "both" : (listing.fulfilment_mode ?? "both"),
      size,
      color,
    });
    if (then === "checkout") {
      setBusy(true);
      router.push("/cart");
      return;
    }
    setAdded(true);
    setTimeout(() => setAdded(false), 1800);
  }

  return (
    <div className="nm-sticky-chrome sticky bottom-[78px] z-30 -mx-4 border-t border-[var(--line)] bg-white px-4 py-3 md:bottom-0 md:mx-0 md:rounded-2xl md:border md:shadow-card">
      {/* ── Size ─────────────────────────────────────────────────────── */}
      {sizes.length > 0 && (
        <div className="mb-2.5">
          <div className="mb-1.5 flex items-baseline justify-between">
            <p className="text-[11.5px] font-bold uppercase tracking-wide text-ink-500">Size</p>
            <p className="text-[11.5px] text-ink-400">{size ?? "Choose one"}</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {sizes.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSize(s)}
                aria-pressed={size === s}
                className={cn(
                  "h-8 min-w-[38px] rounded-lg border px-2.5 text-[12.5px] font-semibold transition",
                  size === s
                    ? "border-[#0f753c] bg-[#0f753c] text-white"
                    : "border-[var(--line)] bg-white text-ink-700 hover:border-brand-300",
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Colour ───────────────────────────────────────────────────── */}
      {colors.length > 0 && (
        <div className="mb-2.5">
          <div className="mb-1.5 flex items-baseline justify-between">
            <p className="text-[11.5px] font-bold uppercase tracking-wide text-ink-500">Colour</p>
            <p className="text-[11.5px] text-ink-400">{color ?? "Choose one"}</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {colors.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-pressed={color === c}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12.5px] font-semibold transition",
                  color === c
                    ? "border-[#0f753c] bg-[#e5f0e9] text-[#0b5c2f]"
                    : "border-[var(--line)] bg-white text-ink-700 hover:border-brand-300",
                )}
              >
                {/* A swatch when the name is a colour CSS knows; otherwise
                    just the label. `colorSwatch` returns null for names like
                    "Tie-dye" so no wrong dot is drawn. */}
                {colorSwatch(c) && (
                  <span
                    className="h-3 w-3 rounded-full border border-black/10"
                    style={{ background: colorSwatch(c)! }}
                    aria-hidden="true"
                  />
                )}
                {c}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 rounded-xl border border-[var(--line)] px-1">
          <button
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            className="grid h-8 w-8 place-items-center rounded-lg text-ink-600 hover:bg-slate-50"
            aria-label="Decrease quantity"
          >
            −
          </button>
          <span className="w-6 text-center text-[14px] font-bold">{qty}</span>
          <button
            onClick={() => setQty((q) => q + 1)}
            className="grid h-8 w-8 place-items-center rounded-lg text-ink-600 hover:bg-slate-50"
            aria-label="Increase quantity"
          >
            +
          </button>
        </div>

        <button
          onClick={() => add()}
          disabled={busy || !ready}
          className={cn(
            "nm-btn-ghost flex-1 !py-2.5",
            added && "!border-brand-500 !bg-brand-50 !text-brand-700",
            !ready && "opacity-50",
          )}
        >
          {busy ? <Spinner /> : added ? "Added ✓" : "Add to cart"}
        </button>
        <button
          onClick={() => add("checkout")}
          disabled={!ready}
          className={cn("nm-btn-primary flex-1 !py-2.5", !ready && "opacity-50")}
        >
          Buy now
        </button>
      </div>

      <p className="mt-2 text-center text-[11.5px] text-ink-400">
        {missing ? (
          <span className="font-semibold text-[#b45309]">Choose a {missing} to continue</span>
        ) : (
          <>
            {naira(listing.price * qty)} · money held in escrow until you confirm delivery
          </>
        )}
      </p>
    </div>
  );
}

/**
 * A CSS colour for a swatch, or null.
 *
 * Only a small, unambiguous set is mapped. "Green" could be any of a
 * hundred greens, so the swatch is a hint, never a claim — the label is
 * always shown beside it and is what the order records.
 */
function colorSwatch(name: string): string | null {
  const n = name.trim().toLowerCase();
  const map: Record<string, string> = {
    black: "#111111",
    white: "#ffffff",
    grey: "#9ca3af",
    gray: "#9ca3af",
    silver: "#c0c0c0",
    navy: "#1e3a5f",
    blue: "#2563eb",
    "sky blue": "#7dd3fc",
    green: "#16a34a",
    "dark green": "#14532d",
    olive: "#6b7f3a",
    red: "#dc2626",
    maroon: "#7f1d1d",
    burgundy: "#6d1a2b",
    pink: "#ec4899",
    purple: "#7c3aed",
    violet: "#8b5cf6",
    yellow: "#eab308",
    gold: "#d4af37",
    orange: "#f97316",
    brown: "#78350f",
    beige: "#e8dcc4",
    cream: "#f5f0e1",
    teal: "#0d9488",
    turquoise: "#14b8a6",
    coral: "#ff6b4a",
  };
  return map[n] ?? null;
}
