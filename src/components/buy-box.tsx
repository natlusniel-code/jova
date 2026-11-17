"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { addToCart } from "@/lib/cart";
import { naira, cn } from "@/lib/utils";
import { Spinner } from "@/components/ui";

/**
 * The buy box.
 *
 * ── One card, top to bottom ────────────────────────────────────────────────
 * Price, size/colour, quantity and the two buttons all live in the same card
 * on the listing page. The picker and the buttons are still two separate
 * pieces of DOM, so the selection has to live above both of them. That is
 * what `BuyBoxProvider` is for: one piece of state, read by the picker under
 * the price and by the buttons below it, so tapping "15 inches" immediately
 * enables "Add to cart".
 *
 * ── Size and colour are optional ───────────────────────────────────────────
 * A listing with no sizes renders no size row at all — not an empty heading.
 * The same for colour. The choice is required only when the option exists,
 * and `place_order` enforces the same rule on the server so a stale cart
 * cannot slip through.
 */

type BuyBoxState = {
  sizes: string[];
  colors: string[];
  size: string | null;
  setSize: (s: string) => void;
  color: string | null;
  setColor: (c: string) => void;
  qty: number;
  setQty: (n: number) => void;
  /** "size" | "colour" | null — what the buyer still has to pick. */
  missing: "size" | "colour" | null;
  ready: boolean;
};

const Ctx = createContext<BuyBoxState | null>(null);

export function BuyBoxProvider({
  sizes,
  colors,
  children,
}: {
  sizes?: string[] | null;
  colors?: string[] | null;
  children: React.ReactNode;
}) {
  const cleanSizes = useMemo(() => (sizes ?? []).filter(Boolean), [sizes]);
  const cleanColors = useMemo(() => (colors ?? []).filter(Boolean), [colors]);

  // A single option is not a choice — preselect it so the buyer is not asked
  // to confirm the only thing available.
  const [size, setSize] = useState<string | null>(cleanSizes.length === 1 ? cleanSizes[0] : null);
  const [color, setColor] = useState<string | null>(cleanColors.length === 1 ? cleanColors[0] : null);
  const [qty, setQty] = useState(1);

  const missing: "size" | "colour" | null =
    cleanSizes.length > 0 && !size ? "size" : cleanColors.length > 0 && !color ? "colour" : null;

  const value: BuyBoxState = {
    sizes: cleanSizes,
    colors: cleanColors,
    size,
    setSize,
    color,
    setColor,
    qty,
    setQty,
    missing,
    ready: !missing,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function useBuyBox(): BuyBoxState {
  const v = useContext(Ctx);
  if (!v) throw new Error("VariantPicker / BuyActions must be inside <BuyBoxProvider>");
  return v;
}

/**
 * The size and colour rows. Rendered directly under the price.
 *
 * Returns null when the listing offers neither, so a plain product page is
 * exactly as it was before this feature existed.
 */
export function VariantPicker({
  className,
  variant = "card",
}: {
  className?: string;
  /** "card" stands alone; "bare" sits inside an existing card. */
  variant?: "card" | "bare";
}) {
  const { sizes, colors, size, setSize, color, setColor } = useBuyBox();
  if (sizes.length === 0 && colors.length === 0) return null;

  return (
    <div className={cn(variant === "card" ? "nm-card p-4" : "", className)}>
      {sizes.length > 0 && (
        <div className={colors.length > 0 ? "mb-3.5" : ""}>
          <div className="mb-2 flex items-baseline justify-between">
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
                  "h-9 min-w-[44px] rounded-lg border px-3 text-[12.5px] font-semibold transition",
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

      {colors.length > 0 && (
        <div>
          <div className="mb-2 flex items-baseline justify-between">
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
                  "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[12.5px] font-semibold transition",
                  color === c
                    ? "border-[#0f753c] bg-[#e5f0e9] text-[#0b5c2f]"
                    : "border-[var(--line)] bg-white text-ink-700 hover:border-brand-300",
                )}
              >
                {/* A swatch only when the name is a colour CSS knows; the
                    label is always shown and is what the order records. */}
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
    </div>
  );
}

/**
 * Quantity, Add to cart and Buy now.
 *
 * `variant="bare"` is the default: it sits inside the price card, directly
 * under the size/colour picker, so the whole decision reads top to bottom in
 * one place. `"inline"` is a standalone card and `"sticky"` the pinned phone
 * bar — both kept for other surfaces that still want them.
 */
export function BuyActions({
  listing,
  shop,
  variant = "bare",
}: {
  listing: {
    id: string;
    title: string;
    price: number;
    original_price?: number | null;
    images: string[];
    type?: "product" | "service";
    fulfilment_mode?: "both" | "pickup" | "delivery" | null;
  };
  shop: {
    id: string;
    slug: string;
    name: string;
    logo_url: string | null;
    city: string | null;
    state: string | null;
    delivery_fee: number;
    free_delivery_threshold: number | null;
    pickup_available: boolean;
    shop_address?: string | null;
    shop_lat?: number | null;
    shop_lng?: number | null;
  };
  variant?: "sticky" | "inline" | "bare";
}) {
  const router = useRouter();
  const { size, color, qty, setQty, missing, ready } = useBuyBox();
  const [added, setAdded] = useState(false);
  const [busy, setBusy] = useState(false);

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
    <div
      className={cn(
        variant === "sticky"
          ? "nm-sticky-chrome sticky bottom-[78px] z-30 -mx-4 border-t border-[var(--line)] bg-white px-4 py-3"
          : variant === "inline"
            ? "nm-card p-4"
            : "",
      )}
    >
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 rounded-xl border border-[var(--line)] px-1">
          <button
            onClick={() => setQty(Math.max(1, qty - 1))}
            className="grid h-8 w-8 place-items-center rounded-lg text-ink-600 hover:bg-slate-50"
            aria-label="Decrease quantity"
          >
            −
          </button>
          <span className="w-6 text-center text-[14px] font-bold">{qty}</span>
          <button
            onClick={() => setQty(qty + 1)}
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
          <>{naira(listing.price * qty)} · money held in escrow until you confirm delivery</>
        )}
      </p>
    </div>
  );
}

/**
 * A CSS colour for a swatch, or null.
 *
 * Only a small, unambiguous set is mapped. "Green" could be any of a hundred
 * greens, so the swatch is a hint, never a claim — the label is always shown
 * beside it and is what the order records.
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
