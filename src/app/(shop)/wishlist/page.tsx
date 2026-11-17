import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/supabase/server";
import { getWishlist } from "@/lib/queries";
import { naira, discountPercent, relTime } from "@/lib/utils";
import { EmptyState, Badge, PageHead } from "@/components/ui";
import { WishlistButton } from "@/components/wishlist-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your wishlist" };

/**
 * Saved products and services.
 *
 * A saved listing can disappear from sale after it was saved — the seller
 * hides it, the shop is suspended, or it sells out. Those rows are kept and
 * shown as unavailable rather than filtered out: a buyer who saved something
 * should see that it is gone, not have it vanish and wonder whether they
 * imagined saving it.
 */
export default async function WishlistPage() {
  const session = await getSession();
  if (!session) redirect("/signin?next=%2Fwishlist");

  const rows = await getWishlist(session.user.id);

  const available = rows.filter((r) => {
    const l = r.listings;
    if (!l) return false;
    if (l.status !== "live") return false;
    if (l.shops && l.shops.status !== "approved") return false;
    return true;
  });
  const unavailable = rows.filter((r) => !available.includes(r));

  return (
    <div className="space-y-6">
      <PageHead
        title="Your wishlist"
        sub={
          rows.length === 0
            ? "Nothing saved yet."
            : `${rows.length} saved item${rows.length === 1 ? "" : "s"}${
                unavailable.length ? ` · ${unavailable.length} no longer available` : ""
              }`
        }
        action={
          rows.length > 0 ? (
            <Link href="/search" className="nm-btn-ghost nm-btn-sm">
              Keep browsing →
            </Link>
          ) : undefined
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          icon="❤️"
          title="Your wishlist is empty"
          body="Tap the heart on any product or service to keep it here. Prices and discounts are shown as they are today, so you can see when something drops."
          action="Find something you like"
          href="/"
        />
      ) : (
        <>
          {available.length > 0 && (
            <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
              {available.map((r) => {
                const l = r.listings!;
                const pct = discountPercent(Number(l.price), l.original_price);
                const img = l.images?.[0];
                return (
                  <div
                    key={l.id}
                    className="group flex flex-col overflow-hidden rounded-[20px] border border-[var(--line)] bg-white shadow-card transition duration-200 hover:-translate-y-0.5 hover:border-[#dcd8cf] hover:shadow-lift"
                  >
                    <div className="nm-photo-glass relative m-2 mb-0 aspect-[4/3] overflow-hidden rounded-[14px] border bg-[#f4f2ed]">
                      <Link href={`/listing/${l.id}`} className="block h-full w-full">
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
                      </Link>
                      {pct > 0 && (
                        <span className="absolute left-2 top-2 rounded-full bg-[#e2542f] px-2 py-0.5 text-[10.5px] font-bold text-white shadow-sm">
                          {Number.isInteger(pct) ? pct : pct.toFixed(1)}% off
                        </span>
                      )}
                      <WishlistButton listingId={l.id} saved signedIn />
                    </div>

                    <div className="flex flex-1 flex-col p-3.5">
                      <Link
                        href={`/listing/${l.id}`}
                        className="line-clamp-2 min-h-[38px] text-[13.5px] font-semibold leading-[1.4] text-ink-900 hover:text-brand-600"
                      >
                        {l.title}
                      </Link>
                      <p className="mt-2 flex flex-wrap items-baseline gap-1.5 font-display text-[16px] font-extrabold tracking-[-0.02em] text-ink-900">
                        {naira(l.price)}
                        {pct > 0 && l.original_price != null && (
                          <span className="text-[11.5px] font-medium text-ink-400 line-through">
                            {naira(l.original_price)}
                          </span>
                        )}
                      </p>
                      <div className="mt-auto flex items-center justify-between gap-1.5 pt-2.5">
                        <p className="truncate text-[11.5px] text-ink-500">{l.shops?.name}</p>
                        <span className="shrink-0 text-[10.5px] text-ink-400">saved {relTime(r.created_at)}</span>
                      </div>
                      {l.type === "product" && l.stock === 0 && (
                        <p className="mt-1.5 text-[11px] font-semibold text-[#b23a1b]">Out of stock</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {unavailable.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-[14px] font-bold text-ink-900">No longer available</h2>
              <p className="text-[12.5px] text-ink-500">
                These were removed or sold out after you saved them. You can clear them from your list.
              </p>
              <div className="divide-y divide-[var(--line)] overflow-hidden rounded-[20px] border border-[var(--line)] bg-white shadow-card">
                {unavailable.map((r) => {
                  const l = r.listings;
                  return (
                    <div key={l?.id ?? r.created_at} className="flex items-center gap-3 px-4 py-3.5">
                      <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-[#f1efe9]">
                        {l?.images?.[0] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={l.images[0]} alt="" className="h-full w-full object-cover opacity-50" />
                        ) : (
                          <div className="grid h-full place-items-center text-ink-300">📦</div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-ink-500">
                          {l?.title ?? "This listing was removed"}
                        </p>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          <Badge tone="gray">
                            {!l ? "Removed" : l.status !== "live" ? "Unavailable" : "Shop suspended"}
                          </Badge>
                          {l?.shops?.name && <span className="truncate text-[11px] text-ink-400">{l.shops.name}</span>}
                        </div>
                      </div>
                      {l && <WishlistButton listingId={l.id} saved signedIn variant="plain" />}
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
