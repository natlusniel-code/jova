import Link from "next/link";
import { naira, cn, discountPercent } from "@/lib/utils";
import { Star, VerifiedBadge, PremiumBadge } from "@/components/ui";
// From `plan-rules`, not `plan-gate`: this file is pulled into the client
// bundle by the AI search bar, and `plan-gate` carries `server-only`.
import { isPremiumSeller } from "@/lib/plan-rules";
import { WishlistButton } from "@/components/wishlist-button";
import { TrackedListingLink } from "@/components/tracked-listing-link";
import type { Listing, ShopLite } from "@/lib/queries";
import { logoShadow } from "@/lib/logo-shadow";

/** "Ikeja, Lagos" — the location line every card must show. */
export function placeLabel(shop?: { city?: string | null; state?: string | null } | null): string | null {
  if (!shop) return null;
  const city = shop.city?.trim();
  const state = shop.state?.trim();
  if (city && state) return `${city}, ${state}`;
  return city || state || null;
}

function PinIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

/**
 * The buyer's product card.
 *
 * ── Layout ──────────────────────────────────────────────────────────────
 * Photo on top in a 4:3 frame, then a padded body: title, price, seller,
 * location. The body has real padding (14px) and the lines are spaced
 * apart, so a grid of these reads as a shelf rather than a wall of text.
 *
 * ── The photo frame ─────────────────────────────────────────────────────
 * `nm-photo-glass` draws the thin green glass outline around the image
 * (see globals.css). It is on the image wrapper, not the card, so the
 * outline hugs the photo and the card keeps its own neutral border.
 */
export function ListingCard({
  l,
  className,
  saved = false,
  signedIn = false,
}: {
  l: Listing;
  className?: string;
  /** Whether this buyer already has it in their wishlist. */
  saved?: boolean;
  signedIn?: boolean;
}) {
  const img = l.images?.[0];
  const place = placeLabel(l.shops);
  const pct = discountPercent(Number(l.price), l.original_price);
  return (
    <TrackedListingLink
      listingId={l.id}
      href={`/listing/${l.id}`}
      className={cn(
        "group flex flex-col overflow-hidden rounded-[20px] border border-[var(--line)] bg-white shadow-card transition duration-200 hover:-translate-y-0.5 hover:border-[#dcd8cf] hover:shadow-lift",
        className,
      )}
    >
      <div className="nm-photo-glass relative m-2 mb-0 aspect-[4/3] overflow-hidden rounded-[14px] border bg-[#f4f2ed]">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={img}
            alt={l.title}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
            loading="lazy"
          />
        ) : (
          <div className="grid h-full place-items-center text-3xl text-ink-300">📦</div>
        )}

        {/* discount badge — only when the price is genuinely lower */}
        {pct > 0 && (
          <span className="absolute left-2 top-2 rounded-full bg-[#e2542f] px-2 py-0.5 text-[10.5px] font-bold text-white shadow-sm">
            {Number.isInteger(pct) ? pct : pct.toFixed(1)}% off
          </span>
        )}
        {l.type === "service" && (
          <span
            className={cn(
              "absolute left-2 rounded-full bg-white/95 px-2 py-0.5 text-[10.5px] font-bold text-brand-800 shadow-sm",
              pct > 0 ? "top-9" : "top-2",
            )}
          >
            Service
          </span>
        )}

        <WishlistButton listingId={l.id} saved={saved} signedIn={signedIn} />

        {l.stock === 0 && l.type === "product" && (
          <span className="absolute inset-0 grid place-items-center bg-white/75 text-[12.5px] font-bold text-ink-700">
            Out of stock
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-3.5">
        <p className="line-clamp-2 min-h-[38px] text-[13.5px] font-semibold leading-[1.4] text-ink-900">
          {l.title}
        </p>

        <p className="mt-2 flex flex-wrap items-baseline gap-1.5">
          <span className="font-display text-[16px] font-extrabold tracking-[-0.02em] text-ink-900">
            {naira(l.price)}
          </span>
          {pct > 0 && l.original_price != null && (
            <span className="text-[11.5px] font-medium text-ink-400 line-through">{naira(l.original_price)}</span>
          )}
          {l.type === "service" && <span className="text-[11px] font-medium text-ink-400">from</span>}
        </p>

        <div className="mt-auto pt-2.5">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-[11.5px] font-medium text-ink-500">{l.shops?.name}</p>
            {l.shops?.verified && (
              <svg viewBox="0 0 24 24" className="h-3 w-3 shrink-0 text-brand-500" fill="currentColor" aria-label="Verified seller">
                <path d="M12 2 15.1 4.6l4.1.2.2 4.1L22 12l-2.6 3.1-.2 4.1-4.1.2L12 22l-3.1-2.6-4.1-.2-.2-4.1L2 12l2.6-3.1.2-4.1 4.1-.2L12 2Z" opacity=".2" />
                <path d="m10.6 14.6-2.2-2.2 1.1-1.1 1.1 1.1 3.9-3.9 1.1 1.1-5 5Z" />
              </svg>
            )}
          </div>
          {/* location line — readable even when the image fails */}
          {place && (
            <p className="mt-1 flex items-center gap-1 text-[11px] text-ink-400">
              <PinIcon className="h-3 w-3 shrink-0" />
              <span className="truncate">{place}</span>
            </p>
          )}
        </div>
      </div>
    </TrackedListingLink>
  );
}

/**
 * A shop card — reference 3.
 *
 * ── The logo bug this fixes ─────────────────────────────────────────────
 * The old card put the logo in a `-mt-7` flow block with `object-cover`.
 * Two things went wrong: `object-cover` cropped a non-square logo (most
 * seller marks are wordmarks, so the ends were cut off), and the negative
 * margin pulled the logo up over the banner but left it inside the
 * padded body, so a tall logo was clipped by the card's `overflow-hidden`
 * and a wide one was cropped to a square.
 *
 * Now the logo is absolutely positioned ON the banner, in a fixed 62px
 * tile with `object-contain` and a white background, so the whole mark is
 * always visible whatever its aspect ratio. It carries a white ring and a
 * shadow whose colour is derived from the banner (see `logoShadow`), so
 * the mark sits on the banner rather than floating over it.
 *
 * ── The banner ──────────────────────────────────────────────────────────
 * 16:7, full width, `object-cover` — a banner is decorative, so cropping
 * it is correct. A shop with no banner gets a green gradient rather than
 * a grey hole.
 */
export function ShopCard({ s, wide = false }: { s: ShopLite; wide?: boolean }) {
  const place = placeLabel(s);
  return (
    <Link
      href={`/shop/${s.slug}`}
      className={cn(
        "nm-seller group",
        wide ? "w-full" : "w-[186px] shrink-0 sm:w-[212px]",
      )}
    >
      <div className="nm-seller-banner">
        {s.banner_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={s.banner_url}
            alt=""
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
            loading="lazy"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-brand-500 via-brand-600 to-brand-800" />
        )}

        {/* The logo, on the banner. `logoShadow` tints the drop shadow with
            the banner's own colour so the mark belongs to the artwork. */}
        <span
          className="nm-seller-logo"
          style={{ ["--nm-logo-shadow" as string]: logoShadow(s.banner_url) }}
        >
          {s.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={s.logo_url} alt={s.name} loading="lazy" />
          ) : (
            <span className="grid h-full w-full place-items-center bg-brand-500 text-[17px] font-extrabold text-white">
              {s.name.slice(0, 2).toUpperCase()}
            </span>
          )}
        </span>
      </div>

      <div className="flex flex-1 flex-col px-4 pb-4 pt-9">
        <p className="truncate text-[15.5px] font-extrabold tracking-[-0.02em] text-ink-900">{s.name}</p>

        <div className="mt-1 flex items-center gap-1.5">
          <Star value={Number(s.rating_avg)} count={s.rating_count} />
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {s.verified && (
            <span className="nm-verified-pill">
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
                <path d="M12 2 15.1 4.6l4.1.2.2 4.1L22 12l-2.6 3.1-.2 4.1-4.1.2L12 22l-3.1-2.6-4.1-.2-.2-4.1L2 12l2.6-3.1.2-4.1 4.1-.2L12 2Z" opacity=".18" />
                <path d="m10.6 14.6-2.2-2.2 1.1-1.1 1.1 1.1 3.9-3.9 1.1 1.1-5 5Z" />
              </svg>
              Verified
            </span>
          )}
          {isPremiumSeller(s) && <PremiumBadge />}
        </div>

        {place && (
          <span className="mt-2 inline-flex items-center gap-1 text-[12px] text-ink-400">
            <PinIcon className="h-3 w-3 shrink-0" />
            <span className="truncate">{place}</span>
          </span>
        )}
      </div>
    </Link>
  );
}

/**
 * A shadow colour derived from the banner.
 *
 * The banner is a remote image, so its pixels cannot be read here without
 * a canvas round trip (and a CORS failure on most CDNs). Instead the
 * shadow is derived from the shop's own identity: a stable hash of the
 * banner URL picks a hue, and the result is a deep, low-saturation tint
 * of it. That is enough for the logo to look like it belongs to the
 * artwork — a warm brown under a wood-toned banner, a cool blue under a
 * blue one — without ever being a random colour.
 *
 * A shop with no banner gets the brand green, which is what the gradient
 * fallback is.
 *
 * The implementation lives in `@/lib/logo-shadow` so the shop page and
 * this card cannot drift apart.
 */
