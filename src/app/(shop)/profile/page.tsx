import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, createClient } from "@/lib/supabase/server";
import { naira, shortDate } from "@/lib/utils";
import { Badge } from "@/components/ui";
import { ProfileForm, AvatarEditor } from "@/components/profile-form";
import { SignOutButton } from "@/components/sign-out-button";
import { InstallAppRow } from "@/components/install-app-row";
import { SUPPORT_WHATSAPP_DISPLAY } from "@/lib/support";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your profile" };

/**
 * Profile — reference 7.
 *
 * ── Layout ──────────────────────────────────────────────────────────────
 *   1. A white identity card: a large sage avatar tile, the name, the
 *      email and phone on one grey line, a "Verified buyer" pill and a
 *      location pill, then an "Edit profile" outline button.
 *   2. Three stat tiles — Orders / Saved / Messages — each with a green
 *      icon, a label and a count.
 *   3. One grouped settings list: delivery location, notification
 *      settings, security & privacy, policies, help & support, sign out.
 *      Each row has a green icon tile, a bold title, a grey subtitle and
 *      a chevron.
 *
 * ── What is preserved ───────────────────────────────────────────────────
 * Every destination the old page carried is still here — the profile
 * form, the avatar editor, saved addresses, payment receipts, the seller
 * CTA, the install-app row, Ask Support and the sign-out button. They are
 * re-arranged into the reference's shape rather than dropped: the form
 * and the receipts sit below the settings list, where a buyer who wants
 * to change something will scroll to.
 *
 * ── The counts ──────────────────────────────────────────────────────────
 * Orders, saved items and unread messages are read from the database, not
 * hard-coded. A tile that says "6 total" when the buyer has none would be
 * a lie on the first screen of their account.
 */

/** One settings row: green icon tile, title + subtitle, chevron. */
function SetRow({
  href,
  icon,
  title,
  sub,
  right,
}: {
  href?: string;
  icon: React.ReactNode;
  title: string;
  sub?: string;
  right?: React.ReactNode;
}) {
  const body = (
    <>
      <span className="nm-set-ic">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-bold text-ink-900">{title}</span>
        {sub && <span className="mt-0.5 block truncate text-[11.5px] text-ink-500">{sub}</span>}
      </span>
      {right ?? (
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4 shrink-0 text-ink-300"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m9 6 6 6-6 6" />
        </svg>
      )}
    </>
  );

  return href ? (
    <Link href={href} className="nm-set-row">
      {body}
    </Link>
  ) : (
    <div className="nm-set-row">{body}</div>
  );
}

const I = {
  pin: (
    <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  ),
  bell: (
    <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8.5a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16s-2-1.5-2-6.5Z" />
      <path d="M10.3 19a2 2 0 0 0 3.4 0" />
    </svg>
  ),
  lock: (
    <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
      <path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" />
    </svg>
  ),
  doc: (
    <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3.5h7l5 5v12H6z" />
      <path d="M13 3.5v5h5M9 13h6M9 16.5h4" />
    </svg>
  ),
  help: (
    <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .9-1 1.6v.3" />
      <path d="M12 17h.01" />
    </svg>
  ),
  out: (
    <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 4.5H6.5a1.5 1.5 0 0 0-1.5 1.5v12a1.5 1.5 0 0 0 1.5 1.5H14" />
      <path d="M17 8.5 20.5 12 17 15.5M10 12h10" />
    </svg>
  ),
  box: (
    <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
      <path d="m4 7.5 8 4.5 8-4.5M12 12v9" />
    </svg>
  ),
  heart: (
    <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20.5s-7.5-4.6-7.5-9.6a4.4 4.4 0 0 1 7.5-3.1 4.4 4.4 0 0 1 7.5 3.1c0 5-7.5 9.6-7.5 9.6Z" />
    </svg>
  ),
  chat: (
    <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.5 12c0 4.1-3.8 7.4-8.5 7.4-1 0-1.9-.15-2.8-.42L4 21l1.3-3.6A7 7 0 0 1 3.5 12C3.5 7.9 7.3 4.6 12 4.6s8.5 3.3 8.5 7.4Z" />
    </svg>
  ),
};

export default async function ProfilePage() {
  const session = await getSession();
  if (!session) redirect("/signin?next=%2Fprofile");

  const supabase = createClient();
  const [
    { data: addresses },
    { data: receipts },
    { count: orderCount },
    { count: savedCount },
    { data: unread },
  ] = await Promise.all([
    supabase.from("addresses").select("*").eq("user_id", session.user.id),
    supabase
      .from("payments")
      .select("id,amount,reference,status,receipt_url,created_at,type")
      .eq("type", "order")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("buyer_id", session.user.id),
    // `wishlists` is keyed on (user_id, listing_id) — there is no `id`
    // column, so the count is taken over `listing_id`.
    supabase.from("wishlists").select("listing_id", { count: "exact", head: true }).eq("user_id", session.user.id),
    supabase.rpc("unread_message_count"),
  ]);

  const p = session.profile;
  const unreadMessages = typeof unread === "number" ? unread : 0;
  const place = [p.city, p.state].filter(Boolean).join(", ");

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {/* ══ Identity card ══════════════════════════════════════════════ */}
      <section className="nm-prof-card p-5">
        <div className="flex items-start gap-4">
          <AvatarEditor avatarUrl={p.avatar_url} name={p.full_name} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[18px] font-extrabold tracking-[-0.02em] text-ink-900">
              {p.full_name || "Your name"}
            </p>
            <p className="mt-0.5 truncate text-[12.5px] text-ink-500">
              {p.email}
              {p.phone ? ` · ${p.phone}` : ""}
            </p>

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-full bg-[#e8f5e9] px-2.5 py-1 text-[11px] font-bold text-[#1f7a3d]">
                <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor" aria-hidden="true">
                  <path d="M12 2 15.1 4.6l4.1.2.2 4.1L22 12l-2.6 3.1-.2 4.1-4.1.2L12 22l-3.1-2.6-4.1-.2-.2-4.1L2 12l2.6-3.1.2-4.1 4.1-.2L12 2Z" opacity=".18" />
                  <path d="m10.6 14.6-2.2-2.2 1.1-1.1 1.1 1.1 3.9-3.9 1.1 1.1-5 5Z" />
                </svg>
                {session.isAdmin ? "Admin" : session.shop ? "Verified seller" : "Verified buyer"}
              </span>
              {place && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#f2f1ed] px-2.5 py-1 text-[11px] font-semibold text-ink-600">
                  {place}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Edit profile — an outline button, as the reference draws it. It
            scrolls to the form below rather than opening a modal, so the
            form is also reachable by simply scrolling. */}
        <a
          href="#edit-profile"
          className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-full border border-[var(--line)] bg-white px-4 text-[12.5px] font-bold text-ink-800 transition hover:border-brand-300 hover:text-brand-700"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 20h4l10-10-4-4L4 16v4Z" />
            <path d="m13.5 6.5 4 4" />
          </svg>
          Edit profile
        </a>
      </section>

      {/* ══ Stat tiles ═════════════════════════════════════════════════ */}
      <section className="grid grid-cols-3 gap-2.5">
        <Link href="/orders" className="nm-stat-tile">
          <span className="text-[#0f753c]">{I.box}</span>
          <span className="mt-1 text-[11.5px] font-semibold text-ink-500">Orders</span>
          <span className="text-[13.5px] font-extrabold text-ink-900">{orderCount ?? 0} total</span>
        </Link>
        <Link href="/wishlist" className="nm-stat-tile">
          <span className="text-[#0f753c]">{I.heart}</span>
          <span className="mt-1 text-[11.5px] font-semibold text-ink-500">Saved</span>
          <span className="text-[13.5px] font-extrabold text-ink-900">{savedCount ?? 0} items</span>
        </Link>
        <Link href="/chats" className="nm-stat-tile">
          <span className="text-[#0f753c]">{I.chat}</span>
          <span className="mt-1 text-[11.5px] font-semibold text-ink-500">Messages</span>
          <span className="text-[13.5px] font-extrabold text-ink-900">
            {unreadMessages > 0 ? `${unreadMessages} unread` : "All read"}
          </span>
        </Link>
      </section>

      {/* ══ Settings list ══════════════════════════════════════════════ */}
      <section className="nm-prof-card divide-y divide-[#f2f0ea] overflow-hidden">
        <SetRow
          href="/profile/location"
          icon={I.pin}
          title="Delivery location"
          sub={place || "Set where you want things delivered"}
        />
        <SetRow
          href="/notifications"
          icon={I.bell}
          title="Notification settings"
          sub="Push, in-app and order updates"
        />
        <SetRow
          href="/profile/support"
          icon={I.lock}
          title="Security & privacy"
          sub="Sessions, data and blocking"
        />
        <SetRow
          href="/legal/terms"
          icon={I.doc}
          title="Policies"
          sub="Terms, privacy, refunds"
        />
        <SetRow
          href="/help"
          icon={I.help}
          title="Help & support"
          sub={`WhatsApp ${SUPPORT_WHATSAPP_DISPLAY}`}
        />
        {/* Sign out is the one row with no chevron: it is an action, not a
            destination. The button itself is the row. */}
        <div className="nm-set-row">
          <span className="nm-set-ic">{I.out}</span>
          <span className="min-w-0 flex-1">
            <SignOutButton />
          </span>
        </div>
      </section>

      {/* ══ Seller CTA ═════════════════════════════════════════════════ */}
      {!session.shop && (
        <Link
          href="/seller/onboarding"
          className="flex items-center justify-between gap-3 rounded-[20px] bg-[#0f753c] px-5 py-4 text-white shadow-[0_10px_26px_-14px_rgba(15,117,60,.8)] transition hover:brightness-105"
        >
          <span className="min-w-0">
            <span className="block text-[13.5px] font-bold">Become a seller</span>
            <span className="mt-0.5 block text-[11.5px] text-white/75">
              List products or offer services, free to start
            </span>
          </span>
          <span className="shrink-0 rounded-full bg-white/15 px-2.5 py-1 text-[11.5px] font-bold">
            ₦5,000 / mo
          </span>
        </Link>
      )}
      {session.shop && (
        <Link
          href="/seller"
          className="flex items-center justify-between gap-3 rounded-[20px] bg-[#0f753c] px-5 py-4 text-white shadow-[0_10px_26px_-14px_rgba(15,117,60,.8)] transition hover:brightness-105"
        >
          <span className="text-[13.5px] font-bold">Open your seller hub</span>
          <span aria-hidden="true">→</span>
        </Link>
      )}

      {/* ══ The form and the receipts ══════════════════════════════════
          Below the settings list, where a buyer who wants to change
          something will scroll to. The anchor is what "Edit profile"
          jumps to. */}
      <div id="edit-profile" className="scroll-mt-24">
        <ProfileForm
          initial={{
            full_name: p.full_name,
            phone: p.phone ?? "",
            state: p.state ?? "Ogun",
            city: p.city ?? "Abeokuta South",
          }}
        />
      </div>

      <section className="nm-prof-card p-5">
        <div className="flex items-center justify-between">
          <p className="text-[14px] font-bold text-ink-900">Saved addresses</p>
          <Link href="/profile/location" className="text-[12.5px] font-semibold text-brand-600">
            Manage
          </Link>
        </div>
        {addresses?.length ? (
          <ul className="mt-3 space-y-2">
            {addresses.map((a: any) => (
              <li key={a.id} className="rounded-[13px] border border-[var(--line)] bg-[var(--surface-2)] px-3.5 py-2.5">
                <p className="text-[12.5px] font-semibold text-ink-900">
                  {a.label} {a.is_default && <Badge tone="green" className="ml-1">default</Badge>}
                </p>
                <p className="text-[12px] text-ink-500">
                  {a.line1}, {a.city} {a.state}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1.5 text-[12.5px] text-ink-500">No saved addresses yet — add one at checkout.</p>
        )}
      </section>

      <section className="nm-prof-card p-5">
        <div className="flex items-center justify-between">
          <p className="text-[14px] font-bold text-ink-900">Payment receipts</p>
          <Link href="/orders" className="text-[12.5px] font-semibold text-brand-600">
            All orders ({orderCount ?? 0})
          </Link>
        </div>
        {receipts?.length ? (
          <ul className="mt-3 divide-y divide-[var(--line)]">
            {receipts.map((r: any) => (
              <li key={r.id} className="flex items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <p className="font-mono text-[11.5px] text-ink-500">{r.reference}</p>
                  <p className="text-[12px] text-ink-400">{shortDate(r.created_at)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-[12.5px] font-bold text-ink-900">{naira(r.amount)}</span>
                  <Badge tone={r.status === "verified" ? "green" : r.status === "rejected" ? "red" : "amber"}>
                    {r.status === "verified" ? "Verified" : r.status === "rejected" ? "Rejected" : "Checking"}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1.5 text-[12.5px] text-ink-500">
            Nothing here yet. Once you upload a transfer receipt it appears here.
          </p>
        )}
      </section>

      {/* Renders only when the app is NOT installed — a user who already has
          it sees no "Install app" row at all. See install-app-row.tsx. */}
      <InstallAppRow />

      <p className="pb-2 text-center text-[11px] text-ink-400">
        Signed in as {p.email} · Jova holds all payments in escrow.
      </p>
    </div>
  );
}
