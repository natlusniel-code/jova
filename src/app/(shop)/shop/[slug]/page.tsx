import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { getSession, createClient } from "@/lib/supabase/server";
import { getShopBySlug, getShopListings, getShopReviews, getWishlistIds } from "@/lib/queries";
import { naira, shortDate } from "@/lib/utils";
import { Star, VerifiedBadge, PremiumBadge, Badge, Avatar, EmptyState } from "@/components/ui";
import { isPremiumSeller } from "@/lib/plan-gate";
import { ListingCard } from "@/components/cards";
import { FollowButton } from "@/components/follow-button";
import { ChatPill } from "@/components/chat-pill";
import { ShopSignInPrompt } from "@/components/shop-signin-prompt";
import { logoShadow } from "@/lib/logo-shadow";

export const dynamic = "force-dynamic";

/**
 * Link preview for a shared shop.
 *
 * When a seller pastes their shop link into WhatsApp, Instagram, X or
 * Telegram, the unfurler reads these tags. Without them every shop shared the
 * same generic NaijaMart card, so a buyer had no idea who they were about to
 * open. Now the card carries the shop's own banner as the image and its bio as
 * the description.
 *
 * Order of preference for the image: banner → logo → the site icon. A shop
 * that has only uploaded a logo still gets a recognisable card instead of a
 * blank one.
 *
 * `absolute` URLs are required: Open Graph consumers do not resolve relative
 * paths, and Supabase storage URLs are already absolute, so they pass through
 * untouched.
 */
export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const shop = await getShopBySlug(params.slug);
  if (!shop) return { title: "Shop not found" };

  const image: string | undefined = shop.banner_url || shop.logo_url || undefined;

  // The bio is the seller's own words. Trim it to a length that unfurlers show
  // in full rather than truncating mid-sentence with an ellipsis.
  const rawBio: string = (shop.description ?? "").replace(/\s+/g, " ").trim();
  const bio =
    rawBio.length > 0
      ? rawBio.length > 160
        ? `${rawBio.slice(0, 157).trimEnd()}…`
        : rawBio
      : `${shop.name} on NaijaMart — ${shop.kind === "services" ? "services" : "goods"} from ${shop.city}, ${shop.state}. Pay through escrow.`;

  const title = `${shop.name}${shop.verified ? " ✓" : ""} · NaijaMart`;
  const url = `/shop/${shop.slug}`;

  // Open Graph consumers require an ABSOLUTE url. Next only absolutises it when
  // `metadataBase` is set, and this app has no single canonical host (Vercel
  // preview, custom domain, localhost), so it is resolved from the request
  // headers here. Falls back to the production domain.
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  const origin = host ? `${proto}://${host}` : "https://naijamart-marketplace-opal.vercel.app";
  const absoluteUrl = `${origin}${url}`;

  return {
    title: shop.name,
    description: bio,
    alternates: { canonical: absoluteUrl },
    openGraph: {
      type: "profile",
      title,
      description: bio,
      url: absoluteUrl,
      siteName: "NaijaMart",
      images: image ? [{ url: image, alt: `${shop.name} banner` }] : undefined,
    },
    twitter: {
      // `summary_large_image` is what makes the banner render wide instead of
      // as a small square thumbnail beside the text.
      card: image ? "summary_large_image" : "summary",
      title,
      description: bio,
      images: image ? [image] : undefined,
    },
  };
}

export default async function ShopPage({ params }: { params: { slug: string } }) {
  const session = await getSession();
  const shop = await getShopBySlug(params.slug);
  if (!shop) notFound();

  // pending/suspended shops are only visible to their owner and admins
  const isOwner = session?.shop?.id === shop.id;
  if (shop.status !== "approved" && !isOwner && !session?.isAdmin) notFound();

  const [listings, reviews, savedIds] = await Promise.all([
    getShopListings(shop.id),
    getShopReviews(shop.id, 8),
    session ? getWishlistIds(session.user.id) : Promise.resolve([] as string[]),
  ]);
  const saved = new Set(savedIds);

  const supabase = createClient();
  const { count: followers } = await supabase
    .from("shop_followers")
    .select("shop_id", { count: "exact", head: true })
    .eq("shop_id", shop.id);
  let following = false;
  if (session) {
    const { data } = await supabase
      .from("shop_followers")
      .select("shop_id")
      .eq("shop_id", shop.id)
      .eq("user_id", session.user.id)
      .maybeSingle();
    following = !!data;
  }

  const goods = listings.filter((l) => l.type === "product");
  const services = listings.filter((l) => l.type === "service");

  return (
    <div className="-mx-4 md:mx-0">
      {/* Banner, with the logo sitting ON it — reference 3.
          The banner is a wide 16:7 panel (the same ratio the seller card
          uses, so a shop looks the same in the carousel and on its own
          page), and the logo is absolutely positioned at its bottom-left,
          overlapping the edge. That is what the reference draws: the mark
          belongs to the artwork, not to the text block below it.

          The logo tile is `object-contain` on white, so a wordmark is
          never cropped, and its shadow is tinted from the banner (see
          `logoShadow`) so it reads as part of the image rather than a
          sticker dropped on top. */}
      <div className="relative w-full">
        <div className="relative aspect-[16/7] w-full overflow-hidden bg-brand-100 md:rounded-2xl">
          {shop.banner_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shop.banner_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-brand-500 via-brand-600 to-brand-700" />
          )}

          {shop.status !== "approved" && (
            <div className="absolute left-3 top-3">
              <Badge tone={shop.status === "pending" ? "amber" : "red"}>
                {shop.status === "pending" ? "Awaiting approval — not public yet" : `Shop ${shop.status}`}
              </Badge>
            </div>
          )}
        </div>

        {/* The logo, on the banner.
            It is a SIBLING of the banner, not a child: the banner clips its
            own image (`overflow-hidden` for the rounded corners), and a
            logo inside it would be cut in half by the `translate-y-1/2`
            that makes it straddle the edge. Sitting outside, it overlaps
            the banner's bottom edge and is fully visible. */}
        <span
          className="absolute bottom-0 left-4 grid h-[68px] w-[68px] translate-y-1/2 place-items-center overflow-hidden rounded-[20px] bg-white shadow-[0_0_0_3px_#fff,0_12px_26px_-8px_var(--nm-logo-shadow,rgba(16,24,24,.45))] sm:h-[76px] sm:w-[76px]"
          style={{ ["--nm-logo-shadow" as string]: logoShadow(shop.banner_url) }}
        >
          {shop.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shop.logo_url} alt={shop.name} className="h-full w-full object-contain" />
          ) : (
            <span className="grid h-full w-full place-items-center bg-brand-500 text-[19px] font-extrabold text-white">
              {shop.name.slice(0, 2).toUpperCase()}
            </span>
          )}
        </span>
      </div>

      {/* identity ─────────────────────────────────────────────────────────
          The name and trust signals sit BELOW the banner, clear of the
          logo's overhang. `pt-11` is the logo's half-height plus a gap, so
          the name never collides with the mark on any screen width. */}
      <div className="px-4 pt-11 md:px-4">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <h1 className="truncate text-[17px] font-extrabold tracking-tight text-ink-900">{shop.name}</h1>
              {shop.verified && <VerifiedBadge />}
              {/* The Premium badge. `isPremiumSeller` requires a LIVE
                  subscription, not just the plan column — a lapsed seller
                  must not keep advertising a tier they stopped paying for. */}
              {isPremiumSeller(shop) && <PremiumBadge />}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11.5px] text-ink-500">
              <Star value={Number(shop.rating_avg)} count={shop.rating_count} />
              <span>·</span>
              <span className="truncate">{shop.city}, {shop.state}</span>
              <span>·</span>
              <span>{followers ?? 0} followers</span>
            </div>

            {/* Order Delivered — the trust signal a buyer looks for before
                paying a stranger. Shown only once there is something to
                show: "0 delivered" on a new shop reads as a warning. */}
            {(shop.orders_delivered ?? 0) > 0 && (
              <div className="mt-1.5 flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[10.5px] font-bold text-brand-700">
                  ✓ Order Delivered
                </span>
                <span className="text-[10.5px] font-semibold text-ink-500">
                  {shop.orders_delivered} order{shop.orders_delivered === 1 ? "" : "s"}
                </span>
              </div>
            )}
          </div>

          <div className="shrink-0">
            <FollowButton shopId={shop.id} following={following} signedIn={!!session} />
          </div>
        </div>

        {shop.description && (
          <p className="mt-2.5 line-clamp-2 text-[12.5px] leading-relaxed text-ink-600">{shop.description}</p>
        )}
      </div>

      {/* portfolio */}
      <div className="mt-6 px-4 md:px-4">
        {listings.length === 0 ? (
          <EmptyState
            icon="🩯"
            title="This shop is still setting up"
            body={`${shop.name} hasn't published anything yet. Follow the shop or chat to ask what's coming.`}
            action="Browse other sellers"
            href="/"
          />
        ) : (
          <div className="space-y-6">
            {services.length > 0 && (
              <section>
                <h2 className="mb-2.5 text-[15.5px] font-bold text-ink-900">Services</h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {services.map((l) => (
                    <Link key={l.id} href={`/listing/${l.id}`}
                      className="flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-white p-3 shadow-card transition hover:-translate-y-0.5 hover:shadow-lift">
                      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                        {l.images?.[0] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={l.images[0]} alt="" className="h-full w-full object-cover" />
                        ) : <div className="grid h-full place-items-center text-xl">🛠️</div>}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold text-ink-900">{l.title}</p>
                        <p className="text-[12px] font-bold text-brand-700">from {naira(l.price)}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {goods.length > 0 && (
              <section>
                <h2 className="mb-2.5 text-[15.5px] font-bold text-ink-900">Goods</h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {goods.map((l) => (
                    <ListingCard key={l.id} l={l} saved={saved.has(l.id)} signedIn={!!session} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      {/* reviews */}
      <section id="reviews" className="mt-8 px-4 md:px-4">
        <h2 className="mb-2.5 text-[15.5px] font-bold text-ink-900">Reviews {shop.rating_count > 0 && `(${shop.rating_count})`}</h2>
        {reviews.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[var(--line)] bg-white/60 px-4 py-6 text-center text-[13px] text-ink-500">
            No reviews yet — this shop is new.
          </p>
        ) : (
          <div className="space-y-2.5">
            {reviews.map((r: any) => (
              <div key={r.id} className="nm-card p-3.5">
                <div className="flex items-center gap-2">
                  <Avatar name={r.profiles_public?.full_name} src={r.profiles_public?.avatar_url} size={28} />
                  <p className="text-[12.5px] font-semibold text-ink-900">{r.profiles_public?.full_name ?? "Buyer"}</p>
                  <Star value={r.rating} className="ml-auto" />
                </div>
                {r.body && <p className="mt-1.5 text-[13px] leading-relaxed text-ink-600">{r.body}</p>}
                <p className="mt-1 text-[11px] text-ink-400">{shortDate(r.created_at)}</p>
                {r.seller_reply && (
                  <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-[12.5px] text-ink-600">
                    <span className="font-semibold text-ink-800">Seller replied: </span>{r.seller_reply}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {!session && <ShopSignInPrompt />}

      {/* Clearance for the pinned pill, and the pill itself. Without the
          padding the last review would sit underneath a fixed element. */}
      <div className="h-20" aria-hidden="true" />
      <ChatPill
        shopId={shop.id}
        shopName={shop.name}
        shopLogo={shop.logo_url}
        signedIn={!!session}
      />
    </div>
  );
}
