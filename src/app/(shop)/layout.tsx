import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/supabase/server";
import { createClient } from "@/lib/supabase/server";
import { isSellerAccount } from "@/lib/roles";
import { dispatchPushSafely } from "@/lib/push";
import { ShopHeader } from "@/components/shop-header";
import { TabBar } from "@/components/tab-bar";
import { SiteFooter } from "@/components/site-footer";
import { InstallAppPrompt } from "@/components/install-app-prompt";

/**
 * Pages a seller is still allowed to open inside the storefront shell.
 *
 * A seller is not a shopper: the storefront is the buyer's surface, and a
 * seller landing on it means they are browsing instead of running their shop.
 * But a blanket redirect would break real flows, so these are the exceptions:
 *
 *   /shop/<their own slug>  their own public page — the hub links to it, and
 *                           they need to see what buyers see before sharing it
 *   /listing/…              a listing detail, reachable from their own shop
 *   /orders/…               an order detail, opened from a chat or a notification
 *   /profile                account settings, which is not a shopping surface
 *   /help, /legal           support and policy pages
 *
 * Everything else — the home feed, search, wishlist, cart, checkout, the shop
 * directory, and other sellers' pages — sends them to the hub.
 */
const SELLER_ALLOWED_PREFIXES = ["/listing/", "/orders/", "/profile", "/help", "/legal"];

/**
 * Two initials for the header avatar — "Adeola Ogunleye" → "AO".
 *
 * Falls back to a single letter for a one-word name, and to "NM" when
 * there is no name at all, so the circle is never empty.
 */
function initialsOf(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "NM";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function sellerMayView(pathname: string, ownSlug: string | null | undefined): boolean {
  if (pathname === "/") return false;
  // Their OWN public shop page, and only that one. `/shop/` is deliberately not
  // a blanket prefix: another seller's shop is the storefront, and a seller
  // browsing competitors is exactly what this rule exists to stop.
  if (ownSlug && pathname === `/shop/${ownSlug}`) return true;
  // `/shop` with no slug is the directory of all shops — browsing, not allowed.
  if (pathname === "/shop" || pathname === "/shop/") return false;
  return SELLER_ALLOWED_PREFIXES.some((p) => pathname.startsWith(p));
}

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const supabase = createClient();

  /* Flush the push queue opportunistically.
   *
   * Vercel's Hobby plan only allows a daily cron, so delivery cannot hang off
   * a schedule; this is the driver. It is throttled to once per 20s per
   * instance, so on a navigation storm it returns immediately without touching
   * the database.
   *
   * NOT awaited — a delivery problem must never delay a page — and wrapped so
   * a synchronous throw cannot escape into the render either. (`after()` from
   * Next 15 would be the tidier home for this, but this app is on 14.2.15,
   * where it does not exist.)
   */
  // AWAITED, with a 3s cap. `void`-ing this was a silent no-op on a
  // serverless host: the response is sent, the instance freezes, and the
  // un-awaited promise dies after the rows were already claimed — so the
  // notification was marked delivered and never sent. See dispatchPushSafely.
  await dispatchPushSafely();

  // ── Sellers do not shop ────────────────────────────────────────────────
  // The role is the authority (src/lib/roles.ts): an account with role
  // 'seller'/'admin', or one that owns a shop. The pathname comes from the
  // `x-pathname` header the middleware sets, because a layout cannot read the
  // current URL on its own.
  const isSeller = !!session && isSellerAccount(session.profile, session.shop);
  if (isSeller) {
    const pathname = headers().get("x-pathname") ?? "";
    if (!sellerMayView(pathname, session.shop?.slug)) redirect("/seller");
  }

  // Unread MESSAGES, not conversations — the old count never cleared after
  // reading a chat. Backed by the unread_message_count() RPC (sql/0009).
  let unread = 0;
  // Unread NOTIFICATIONS — a separate count from messages, shown on the bell.
  let unreadNotifications = 0;
  if (session) {
    const [{ data: msgCount }, { data: notifCount }] = await Promise.all([
      supabase.rpc("unread_message_count"),
      supabase.rpc("unread_notification_count"),
    ]);
    unread = typeof msgCount === "number" ? msgCount : 0;
    unreadNotifications = typeof notifCount === "number" ? notifCount : 0;
  }

  const city = session?.profile.city ?? "Abeokuta South";

  return (
    <div className="min-h-screen bg-[var(--canvas)]">
      {/* The storefront header — reference 1. A translucent glass bar with
          the brand mark, the bell, the cart and the avatar on row one, and
          the location pills on row two. See shop-header.tsx. */}
      <ShopHeader
        signedIn={!!session}
        initials={initialsOf(session?.profile.full_name)}
        avatarUrl={session?.profile.avatar_url ?? null}
        city={city}
        state={session?.profile.state ?? "Ogun"}
        unreadNotifications={unreadNotifications}
        isSeller={!!session?.shop}
        isAdmin={!!session?.isAdmin}
      />

      {/* `pb-28` clears the floating tab bar (which is ~66px tall and sits
          10px off the bottom). Without it the last card on a page would end
          up underneath the pill. */}
      <main className="mx-auto w-full min-w-0 max-w-7xl overflow-x-clip px-4 pb-28 pt-4 md:pb-12">{children}</main>

      <SiteFooter />

      {/* The floating cart button is gone: the cart now lives in the header
          (reference 1), where it is one tap away from every page and never
          covers the content underneath. `CartFab` is kept in the tree for
          reference but is no longer mounted. */}

      {/* "Install app" toast — only for a signed-in user, and only when the
          browser can actually install the app. It sits above the mobile tab
          bar and never blocks the page. See install-app-prompt.tsx. */}
      {session && <InstallAppPrompt />}

      {/* The buyer tab bar (Home / Search / Saved / Chats / Orders / Profile) is
          the shopper's navigation. A seller gets the hub's own nav instead, so
          showing it here would offer routes that immediately redirect. */}
      {!isSeller && <TabBar unread={unread} />}
    </div>
  );
}

export const dynamic = "force-dynamic";
