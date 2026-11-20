import Link from "next/link";
import { headers } from "next/headers";
import { getSession } from "@/lib/supabase/server";
import {
  getCategories,
  getNearbyShops,
  getStorefrontFeed,
  getPlaces,
  resolveCity,
  getWishlistIds,
  ALL_CITIES,
} from "@/lib/queries";
import { anonymousSeed } from "@/lib/stable-random";
import { ListingCard, ShopCard, placeLabel } from "@/components/cards";
import { SellerCarousel } from "@/components/seller-carousel";
import { GigCard } from "@/components/gig-card";
import { ListingTabs } from "@/components/listing-tabs";
import { LocationFilter } from "@/components/location-filter";
import { RecommendationRail } from "@/components/recommendation-rail";
import { SectionHead, EmptyState, Badge } from "@/components/ui";
import { naira } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SP = { city?: string; tab?: string };

/* ── Small local icons ──────────────────────────────────────────────────
   Inline so the hero and the trust strip carry no icon-font request. */
function Icon({ name, className }: { name: string; className?: string }) {
  const p = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "search":
      return (
        <svg viewBox="0 0 24 24" className={className} {...p}>
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4.5 4.5" />
        </svg>
      );
    case "shield":
      return (
        <svg viewBox="0 0 24 24" className={className} {...p}>
          <path d="M12 3 5 6v6c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6l-7-3Z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
    case "truck":
      return (
        <svg viewBox="0 0 24 24" className={className} {...p}>
          <path d="M3 7h10v9H3zM13 10h4l3 3v3h-7z" />
          <circle cx="7" cy="18" r="1.6" />
          <circle cx="17" cy="18" r="1.6" />
        </svg>
      );
    case "chat":
      return (
        <svg viewBox="0 0 24 24" className={className} {...p}>
          <path d="M20.5 12c0 4.1-3.8 7.4-8.5 7.4-1 0-1.9-.15-2.8-.42L4 21l1.3-3.6A7 7 0 0 1 3.5 12C3.5 7.9 7.3 4.6 12 4.6s8.5 3.3 8.5 7.4Z" />
        </svg>
      );
    case "spark":
      return (
        <svg viewBox="0 0 24 24" className={className} {...p}>
          <path d="M12 3.5 13.7 9l5.5 1.7-5.5 1.7L12 18l-1.7-5.6L4.8 10.7 10.3 9 12 3.5Z" />
        </svg>
      );
    case "arrow":
      return (
        <svg viewBox="0 0 24 24" className={className} {...p}>
          <path d="M5 12h13M13 6l6 6-6 6" />
        </svg>
      );
    case "pin":
      return (
        <svg viewBox="0 0 24 24" className={className} {...p}>
          <path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z" />
          <circle cx="12" cy="10" r="2.5" />
        </svg>
      );
    default:
      return null;
  }
}

export default async function HomePage({
  searchParams: searchParamsPromise,
}: {
  // Next 15: search params arrive as a Promise.
  searchParams: Promise<SP>;
}) {
  const searchParams = await searchParamsPromise;
  const session = await getSession();
  const myCity = session?.profile.city ?? null;
  const myState = session?.profile.state ?? null;

  // The storefront is open by default: products and services load straight
  // away with no city/state gate. A buyer can still narrow the feed with
  // ?city=…, but nothing is hidden until they pick a location.
  const city = resolveCity(searchParams.city, null);
  const browsingAll = city === null;

  // Which tab of the listing section is showing. The blueprint draws the
  // product listing and the service listing as two tabs of one section, so
  // the default is products and `?tab=service` switches to gigs.
  const tab: "product" | "service" = searchParams.tab === "service" ? "service" : "product";

  // ── Which verified sellers this visitor sees ────────────────────────────
  // The row is random per account but stable for that account: the seed is the
  // signed-in user's id, so the same buyer always gets the same shops
  // while a different buyer gets a different set. An anonymous visitor has
  // no id, so the seed is derived from the request headers — hashed, never
  // stored — which keeps the row steady across a few page loads without
  // recording anything about the person. See src/lib/stable-random.ts.
  const hdrs = await headers();
  const shopSeed =
    session?.user.id ??
    anonymousSeed([hdrs.get("user-agent"), hdrs.get("accept-language")]);

  const [categories, places, shops, products, services, savedIds] = await Promise.all([
    getCategories(),
    getPlaces(),
    // Six, not three: the carousel shows one seller at a time and advances
    // every 5 seconds, so it needs a few to rotate through. The order is
    // still seeded per visitor (see stable-random.ts), so it is random
    // between buyers but stable for one buyer.
    getNearbyShops(city, 6, shopSeed),
    // Ranked + rotated daily by storefront_feed (sql/0015): a balanced mix of
    // new, well-rated, best-selling and most-viewed listings rather than
    // "the newest 8", which let the same listings own page one forever.
    getStorefrontFeed(city, "product", 8),
    getStorefrontFeed(city, "service", 6),
    session ? getWishlistIds(session.user.id) : Promise.resolve([] as string[]),
  ]);
  const saved = new Set(savedIds);

  const nothingHere = shops.length === 0 && products.length === 0 && services.length === 0;
  const where = browsingAll ? "all cities" : city;

  // The hero collage uses the first three real listings, so the landing page
  // shows actual stock rather than a stock photo. If the marketplace is empty
  // the collage falls back to a plain panel (see below).
  const heroPicks = products.slice(0, 3);
  const firstName = session?.profile.full_name?.split(" ")[0];

  return (
    <div className="pb-2">
      {/* ══════════════════════════════════════════════════════════════════
          HERO
          ──────────────────────────────────────────────────────────────────
          A deep-green gradient panel — the only large saturated surface in
          the app — with an editorial headline on the left and a live
          collage of real listings on the right. Deliberately asymmetric:
          the copy column is wider than the collage, and the collage is
          offset downward so the two halves do not read as a split screen.

          The panel is a gradient of greens, never black. A soft radial
          highlight in the top-left and a faint dot grid give it depth
          without a photograph.
          ══════════════════════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden rounded-[28px] bg-[linear-gradient(135deg,#0a6b3d_0%,#075232_52%,#053f28_100%)] px-5 py-9 text-white sm:px-9 sm:py-12 lg:px-12 lg:py-14">
        {/* depth: radial highlight + dot grid */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(680px 340px at 8% -10%, rgba(203,242,107,.20), transparent 62%), radial-gradient(520px 300px at 96% 108%, rgba(79,191,125,.22), transparent 60%)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.16]"
          style={{
            backgroundImage: "radial-gradient(rgba(255,255,255,.55) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
            maskImage: "radial-gradient(70% 60% at 50% 40%, #000, transparent)",
            WebkitMaskImage: "radial-gradient(70% 60% at 50% 40%, #000, transparent)",
          }}
        />

        <div className="relative grid items-center gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:gap-12">
          {/* ── Copy column ─────────────────────────────────────────────── */}
          <div className="min-w-0">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[11.5px] font-bold tracking-wide text-[#dff5e6]">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lime opacity-70" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-lime" />
              </span>
              {browsingAll ? "Live across Nigeria" : `Live in ${city}`}
            </span>

            <h1 className="mt-5 max-w-[15ch] font-display text-[34px] font-extrabold leading-[1.04] tracking-[-0.045em] text-white sm:text-[46px] lg:text-[54px]">
              {firstName ? (
                <>
                  {firstName}, the whole
                  <br className="hidden sm:block" /> market is{" "}
                  <span className="relative inline-block">
                    <span className="relative z-10 text-lime">yours</span>
                    <svg
                      aria-hidden
                      viewBox="0 0 200 12"
                      className="absolute -bottom-1 left-0 h-2.5 w-full text-lime/45"
                      preserveAspectRatio="none"
                    >
                      <path d="M2 8c40-6 90-7 196-3" stroke="currentColor" strokeWidth="4" fill="none" strokeLinecap="round" />
                    </svg>
                  </span>
                  .
                </>
              ) : (
                <>
                  The whole market,
                  <br className="hidden sm:block" /> one{" "}
                  <span className="text-lime">honest</span> place.
                </>
              )}
            </h1>

            <p className="mt-4 max-w-[46ch] text-[14px] leading-relaxed text-[#cfe8d8] sm:text-[15px]">
              Buy from verified local sellers, pay into escrow, and release the money only when
              it lands in your hands. Or open a shop and reach buyers in every state.
            </p>

            {/* Search — the primary action, so it gets the full width of the
                copy column and a real 52px height. */}
            <form action="/search" className="mt-7 flex max-w-[560px] gap-2">
              {city && <input type="hidden" name="city" value={city} />}
              <div className="relative flex-1">
                <Icon
                  name="search"
                  className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-ink-400"
                />
                <input
                  name="q"
                  placeholder="What are you looking for?"
                  aria-label="Search the marketplace"
                  className="h-[52px] w-full rounded-[15px] border border-white/25 bg-white pl-11 pr-4 text-[14.5px] font-medium text-ink-900 shadow-[0_10px_30px_-12px_rgba(0,0,0,.45)] outline-none placeholder:text-ink-400 focus:border-lime focus:ring-4 focus:ring-lime/25"
                />
              </div>
              <button
                type="submit"
                className="grid h-[52px] shrink-0 place-items-center rounded-[15px] bg-lime px-5 text-[14px] font-bold text-[#16240f] transition hover:brightness-105 sm:px-7"
              >
                <span className="hidden sm:inline">Search</span>
                <Icon name="arrow" className="h-5 w-5 sm:hidden" />
              </button>
            </form>

            {/* Trust chips */}
            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2.5 text-[12px] font-semibold text-[#c6e3d1]">
              <span className="inline-flex items-center gap-1.5">
                <Icon name="shield" className="h-4 w-4 text-lime" /> Escrow protected
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Icon name="truck" className="h-4 w-4 text-lime" /> Local delivery
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Icon name="chat" className="h-4 w-4 text-lime" /> Chat before you pay
              </span>
            </div>
          </div>

          {/* ── Showcase column ──────────────────────────────────────────
              Three real listings, stacked as a tidy vertical column rather
              than a fanned collage. The fan looked good in a mockup but in
              the real page the rotated cards spilled out of their grid
              column and sat on top of the headline — the cards are
              absolutely positioned, so their width was never constrained by
              the column and a long product title pushed them left.

              This version is a plain flex column: every card is in normal
              flow, so it can never overlap the copy, and the whole stack is
              capped to the column width. The first card is the "hero" pick
              (larger), the next two are compact rows. Hidden below `lg`
              because on a phone the copy is the whole message. */}
          {heroPicks.length > 0 && (
            <div className="hidden lg:block" aria-hidden>
              <div className="space-y-3">
                {/* Lead card — the biggest, with the price called out. */}
                <div className="overflow-hidden rounded-[20px] border border-white/25 bg-white shadow-[0_24px_50px_-20px_rgba(0,0,0,.6)]">
                  <div className="aspect-[16/10] overflow-hidden bg-[#f4f2ed]">
                    {heroPicks[0].images?.[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={heroPicks[0].images[0]} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="grid h-full place-items-center text-2xl text-ink-300">📦</div>
                    )}
                  </div>
                  <div className="flex items-end justify-between gap-3 p-3.5">
                    <div className="min-w-0">
                      <p className="line-clamp-1 text-[12.5px] font-semibold text-ink-900">
                        {heroPicks[0].title}
                      </p>
                      {placeLabel(heroPicks[0].shops) && (
                        <p className="mt-0.5 flex items-center gap-1 text-[10.5px] text-ink-400">
                          <Icon name="pin" className="h-2.5 w-2.5 shrink-0" />
                          <span className="truncate">{placeLabel(heroPicks[0].shops)}</span>
                        </p>
                      )}
                    </div>
                    <p className="shrink-0 font-display text-[15px] font-extrabold tracking-[-0.02em] text-ink-900">
                      {naira(heroPicks[0].price)}
                    </p>
                  </div>
                </div>

                {/* Two compact rows under it. */}
                {heroPicks.slice(1, 3).map((l) => (
                  <div
                    key={l.id}
                    className="flex items-center gap-3 rounded-[16px] border border-white/20 bg-white/95 p-2.5 shadow-[0_14px_30px_-16px_rgba(0,0,0,.55)]"
                  >
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-[11px] bg-[#f4f2ed]">
                      {l.images?.[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={l.images[0]} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="grid h-full place-items-center text-base text-ink-300">📦</div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-1 text-[11.5px] font-semibold text-ink-900">{l.title}</p>
                      <p className="mt-0.5 text-[10.5px] text-ink-400">
                        {placeLabel(l.shops) ?? "Jova"}
                      </p>
                    </div>
                    <p className="shrink-0 font-display text-[12.5px] font-extrabold text-ink-900">
                      {naira(l.price)}
                    </p>
                  </div>
                ))}
              </div>

              {/* The escrow promise, as a caption under the stack — in flow,
                  so it can never cover a card. */}
              <div className="mt-3 flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-2 text-[11px] font-bold text-[#dff5e6]">
                <Icon name="shield" className="h-3.5 w-3.5 text-lime" />
                Money held until delivery
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          CATEGORIES
          A horizontal shelf of category tiles. Each is a real link into
          search with the category and the current city preserved.
          ══════════════════════════════════════════════════════════════════ */}
      {categories.length > 0 && (
        <section className="nm-sec">
          <SectionHead
            title="Shop by category"
            sub={browsingAll ? "Everything, everywhere" : `Available in ${city}`}
            action="All categories"
            href={`/search?city=${city ? encodeURIComponent(city) : ALL_CITIES}`}
          />
          <div className="nm-rail -mx-4 px-4 sm:mx-0 sm:px-0">
            {categories.map((c: { id: string; name: string; slug: string; icon: string }) => (
              <Link
                key={c.id}
                href={`/search?category=${c.slug}${city ? `&city=${encodeURIComponent(city)}` : `&city=${ALL_CITIES}`}`}
                className="group flex w-[104px] shrink-0 flex-col items-center gap-2.5 rounded-[18px] border border-[var(--line)] bg-white px-2 py-4 text-center shadow-card transition duration-200 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lift"
              >
                <span className="grid h-11 w-11 place-items-center rounded-[14px] bg-brand-50 text-[21px] leading-none transition group-hover:bg-brand-100">
                  {c.icon}
                </span>
                <span className="text-[11.5px] font-semibold leading-tight text-ink-700 group-hover:text-ink-900">
                  {c.name}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Location filter — defaults to the buyer's city, "All cities" widens it */}
      <div className="mt-6">
        <LocationFilter
          places={places}
          activeCity={city}
          myCity={myCity}
          basePath="/"
          className="!mx-0 !px-0"
        />
      </div>

      {nothingHere && (
        <div className="nm-sec">
          <EmptyState
            icon="🏪"
            title={browsingAll ? "No sellers yet" : `No sellers in ${city} yet`}
            body={
              browsingAll
                ? "We're onboarding verified shops. Check back soon, or become the first seller here."
                : "We're onboarding verified shops in your area. Try another city, or browse the whole marketplace."
            }
            action={browsingAll ? "Change your city" : "Browse all cities"}
            href={browsingAll ? "/profile/location" : `/?city=${ALL_CITIES}`}
          />
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          VERIFIED SELLERS
          ══════════════════════════════════════════════════════════════════ */}
      {shops.length > 0 && (
        <section className="nm-sec">
          <SectionHead
            title={browsingAll ? "Verified sellers" : "Verified sellers near you"}
            sub={browsingAll ? "Across every city" : `Shops in ${city}`}
            action="See all"
            href={`/search?verified=1${city ? `&city=${encodeURIComponent(city)}` : `&city=${ALL_CITIES}`}`}
          />
          {/* One seller per view, advancing every 5 seconds — reference 3.
              The card is wide but not full-bleed, so the next one peeks in
              at the edge and the row reads as a carousel. */}
          <SellerCarousel shops={shops} />
        </section>
      )}

      {/* ── Picked for you ────────────────────────────────────────────────
          The AI recommendation rail. Only rendered for a signed-in buyer:
          an anonymous visitor has no history, and the storefront feed
          already handles that case. It renders nothing at all when there
          is nothing to show, so a new buyer sees no empty shell. */}
      {session?.user.id && <RecommendationRail buyerId={session.user.id} limit={6} />}

      {/* ══════════════════════════════════════════════════════════════════
          LISTINGS — products and services as two tabs of one section
          ══════════════════════════════════════════════════════════════════ */}
      {(products.length > 0 || services.length > 0) && (
        <section className="nm-sec">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-[23px]">
                {tab === "service" ? "Services near you" : "Fresh on the market"}
              </h2>
              <p className="mt-1 text-[13px] font-medium text-ink-500">
                {tab === "service"
                  ? "People who will do the job for you"
                  : `Hand-picked from ${where} — new, well-rated and best-selling`}
              </p>
            </div>
          </div>

          <ListingTabs
            current={tab}
            productHref={`/${city ? `?city=${encodeURIComponent(city)}` : ""}`}
            serviceHref={`/?tab=service${city ? `&city=${encodeURIComponent(city)}` : ""}`}
            seeMoreHref={
              tab === "service"
                ? `/services${city ? `?city=${encodeURIComponent(city)}` : ""}`
                : `/search${city ? `?city=${encodeURIComponent(city)}` : `?city=${ALL_CITIES}`}`
            }
            seeMoreLabel={tab === "service" ? "All services" : "Browse all"}
          />

          {tab === "service" ? (
            services.length > 0 ? (
              /* Gigs are ONE per row on a phone, as the layout sketch
                 draws them: a full-width card with a big thumbnail reads as
                 "here is a piece of work someone will do for you", which is
                 the whole point of the format. Products stay two-up below. */
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {services.map((l) => (
                  <GigCard key={l.id} l={l} saved={saved.has(l.id)} signedIn={!!session} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon="🛠️"
                title="No gigs here yet"
                body="Service providers are still signing up. Browse every city, or check back soon."
                action="Browse all cities"
                href={`/?tab=service&city=${ALL_CITIES}`}
              />
            )
          ) : products.length > 0 ? (
            <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
              {products.map((l) => (
                <ListingCard key={l.id} l={l} saved={saved.has(l.id)} signedIn={!!session} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon="📦"
              title="No products here yet"
              body="Nothing listed in this city right now. Try another city, or browse the whole marketplace."
              action="Browse all cities"
              href={`/?city=${ALL_CITIES}`}
            />
          )}
        </section>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          HOW ESCROW WORKS
          Three numbered cards on the warm canvas. This is the trust story,
          so it gets its own section rather than a footnote strip.
          ══════════════════════════════════════════════════════════════════ */}
      <section className="nm-sec">
        <div className="mb-5 max-w-[560px]">
          <span className="nm-badge bg-brand-100 text-brand-800">
            <Icon name="shield" className="h-3 w-3" /> Buyer protection
          </span>
          <h2 className="mt-3 text-[23px] sm:text-[26px]">Your money moves only when you say so</h2>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink-500">
            Every order on Jova runs through escrow. The seller never holds your money before
            you have the goods in hand.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {[
            {
              n: "01",
              t: "Pay into escrow",
              d: "You transfer to Jova's admin account — never directly to the seller.",
            },
            {
              n: "02",
              t: "We verify and release the go-ahead",
              d: "We check your receipt and tell the seller to start preparing your order.",
            },
            {
              n: "03",
              t: "Confirm, then we pay out",
              d: "Money is released to the seller only after you confirm the delivery.",
            },
          ].map((s) => (
            <div
              key={s.n}
              className="relative overflow-hidden rounded-[20px] border border-[var(--line)] bg-white p-5 shadow-card"
            >
              <span className="font-display text-[13px] font-extrabold tracking-[0.08em] text-brand-300">
                {s.n}
              </span>
              <p className="mt-2 text-[15px] font-bold text-ink-900">{s.t}</p>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-500">{s.d}</p>
              <span
                aria-hidden
                className="absolute -right-6 -top-6 h-16 w-16 rounded-full bg-brand-50"
              />
            </div>
          ))}
        </div>
      </section>

    </div>
  );
}
