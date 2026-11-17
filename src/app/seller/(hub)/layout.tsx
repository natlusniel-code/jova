import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, createClient } from "@/lib/supabase/server";
import { dispatchPushSafely } from "@/lib/push";
import { sellerGatePath } from "@/lib/seller-gate";
import { isBuyerAccount } from "@/lib/roles";
import { Logo, Badge, Avatar } from "@/components/ui";
import { SellerNav, SellerSidebar } from "@/components/seller/seller-nav";
import { NotificationBell } from "@/components/notification-bell";
import { InstallAppPrompt } from "@/components/install-app-prompt";
import { SellerPresence } from "@/components/seller/seller-presence";

export const dynamic = "force-dynamic";

export default async function SellerLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/signin?next=%2Fseller");

  /* Flush the push queue.
   *
   * This used to live ONLY in the storefront layout, so a seller who works
   * entirely inside the Seller Hub — or an admin in the console — never drove
   * the dispatcher, and a notification waiting on the queue sat there until
   * somebody happened to open a buyer page. Delivery must not depend on which
   * surface a user happens to be on, so every role's shell drives it now.
   *
   * AWAITED with a 3s cap, not `void`-ed: on a serverless host an un-awaited
   * promise is killed when the response is sent, after the rows were already
   * claimed — so the notification was marked delivered and never sent. */
  try {
    await dispatchPushSafely();
  } catch {
    // a delivery problem must never break a page
  }

  // ── Buyers never see the Seller Hub ────────────────────────────────────
  // The hub is seller-only. A buyer account can still own a `shops` row (an
  // earlier shop, a re-assigned or seeded row), and the approval gate below
  // would then let them straight into the seller dashboard and its account
  // settings page. The role is the authority: a buyer goes to the storefront.
  //
  // `isBuyerAccount` (src/lib/roles.ts) is the one shared rule: a seller is an
  // account with role 'seller'/'admin' OR one that owns a shop. The database
  // enforces that agreement (sql/0014), so a genuine buyer — who owns no shop —
  // is always caught here, and a real seller is never locked out by a stale
  // role read.
  if (isBuyerAccount(session.profile, session.shop)) redirect("/");

  // ── The approval gate ──────────────────────────────────────────────────
  // Every seller-only page lives under this layout, so this one check is what
  // keeps an unapproved seller out of the hub. They are sent back to the exact
  // step they are on (business profile → verification → plan → pending
  // approval) instead of seeing a dashboard for a shop that is not live.
  //
  // `/seller/onboarding` is NOT under this layout (it is a sibling route), so
  // this redirect can never loop.
  const gate = sellerGatePath(session.shop);
  if (gate) redirect(gate);

  const shop = session.shop;

  // Unread counts for the hub header. Messages and notifications are separate
  // numbers: the bell shows notifications, the Chats tab shows messages.
  const supabase = createClient();
  const [{ data: msgCount }, { data: notifCount }] = await Promise.all([
    supabase.rpc("unread_message_count"),
    supabase.rpc("unread_notification_count"),
  ]);
  const unreadMessages = typeof msgCount === "number" ? msgCount : 0;
  const unreadNotifications = typeof notifCount === "number" ? notifCount : 0;

  return (
    <div className="min-h-screen bg-[var(--canvas)]">
      {/* ── Header ────────────────────────────────────────────────────────
          Sticky, warm off-white, hairline rule. The shop identity sits on
          the left, the account cluster on the right, and the mobile nav
          scrolls underneath. */}
      <header className="nm-sticky-chrome sticky top-0 z-30 border-b border-[var(--line)] bg-[#f6f5f1]/95 backdrop-blur-md">
        <div className="nm-wrap flex min-w-0 items-center gap-3 py-3">
          <Logo />
          <span className="hidden h-5 w-px bg-[var(--line)] sm:block" />
          <Badge tone="green" className="hidden sm:inline-flex">
            Seller hub
          </Badge>
          {shop && (
            <Link
              href={`/shop/${shop.slug}`}
              className="hidden min-w-0 items-center gap-1.5 truncate text-[12.5px] font-semibold text-ink-500 transition hover:text-brand-600 md:inline-flex"
            >
              <span className="truncate">{shop.name}</span>
              <svg viewBox="0 0 24 24" className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 17 17 7M9 7h8v8" />
              </svg>
            </Link>
          )}
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {shop && (
              <Link href={`/shop/${shop.slug}`} className="nm-btn-ghost nm-btn-sm hidden sm:inline-flex">
                View shop
              </Link>
            )}
            <NotificationBell unread={unreadNotifications} allHref="/seller/notifications" />
            <Link href="/profile" aria-label="Profile" className="ml-0.5">
              <Avatar name={session.profile.full_name} src={session.profile.avatar_url} size={36} />
            </Link>
          </div>
        </div>
        {shop && (
          <div className="nm-wrap">
            <SellerNav unreadMessages={unreadMessages} />
          </div>
        )}
      </header>

      {/* ── Body: sidebar + content ───────────────────────────────────────
          The sidebar is 236px and the content column is capped at 1000px,
          with a 32px gutter between them. On a phone the sidebar is gone
          and the content takes the full width. */}
      <div className="nm-wrap flex gap-8 py-6 pb-20">
        {shop && <SellerSidebar unreadMessages={unreadMessages} />}
        <main className="min-w-0 flex-1">{children}</main>
      </div>

      {/*
        The presence heartbeat.

        The AI reply decides auto-vs-suggest from `shops.last_seen_at`, and
        this is what keeps that column honest: while the hub is open the
        seller is "online", and 3 minutes after they close it they are not.
        Mounted in the layout so it runs on every hub page, not just chat.
      */}
      <SellerPresence />

      {/* Sellers get the same "Install app" offer as buyers — the request was
          for every signed-in user, not only the storefront. */}
      <InstallAppPrompt />
    </div>
  );
}
