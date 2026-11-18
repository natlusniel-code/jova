import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/supabase/server";
import { getNotifications } from "@/lib/queries";
import { relTime } from "@/lib/utils";
import { EmptyState } from "@/components/ui";
import { PushOptIn } from "@/components/push-opt-in";
import { MarkAllRead } from "@/components/mark-all-read";

export const dynamic = "force-dynamic";
export const metadata = { title: "Notifications" };

/**
 * Notifications — reference 5.
 *
 * ── Layout ──────────────────────────────────────────────────────────────
 * A page title with "Mark all read" on the right, then ONE rounded card
 * holding every row. Rows alternate mint and white, each with a tinted
 * icon tile on the left, a bold title, a grey body line and a relative
 * timestamp. Nothing is grouped into day headings any more: the
 * reference is a single continuous list, and the timestamp on each row
 * already says when it happened.
 *
 * ── The icons ───────────────────────────────────────────────────────────
 * The reference uses a different glyph per kind — a parcel for an order,
 * a speech bubble for a message, a star for a review, a shield for
 * escrow, a party popper for a welcome. Those are reproduced here as
 * inline SVG, tinted per kind, so the list reads at a glance without
 * needing the label.
 *
 * ── What is preserved ───────────────────────────────────────────────────
 * Every row is still a real link when it has an `href`, still marks
 * itself read on the server, and the push opt-in still sits above the
 * list. The unread count is still shown, just as a quiet line under the
 * title rather than a badge.
 */
type Kind = "order" | "chat" | "broadcast" | "system" | "promo" | string;

/** The icon tile for a notification kind. */
function KindIcon({ kind }: { kind: Kind }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  const cls = "h-[19px] w-[19px]";

  switch (kind) {
    case "order":
      // A parcel — brown, as the reference draws it.
      return (
        <span className="nm-notif-ic text-[#a9713f]">
          <svg viewBox="0 0 24 24" className={cls} {...common}>
            <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
            <path d="m4 7.5 8 4.5 8-4.5M12 12v9" />
          </svg>
        </span>
      );
    case "chat":
      // A speech bubble — soft violet, as the reference draws it.
      return (
        <span className="nm-notif-ic text-[#8b7fd4]">
          <svg viewBox="0 0 24 24" className={cls} {...common}>
            <path d="M20.5 12c0 4.1-3.8 7.4-8.5 7.4-1 0-1.9-.15-2.8-.42L4 21l1.3-3.6A7 7 0 0 1 3.5 12C3.5 7.9 7.3 4.6 12 4.6s8.5 3.3 8.5 7.4Z" />
          </svg>
        </span>
      );
    case "promo":
      // A star — gold.
      return (
        <span className="nm-notif-ic text-[#e0a800]">
          <svg viewBox="0 0 24 24" className={cls} fill="currentColor" aria-hidden="true">
            <path d="m12 3.6 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.8l5.9-.9L12 3.6Z" />
          </svg>
        </span>
      );
    case "broadcast":
      // A shield — the escrow promise.
      return (
        <span className="nm-notif-ic text-[#c0392b]">
          <svg viewBox="0 0 24 24" className={cls} {...common}>
            <path d="M12 3 5 6v6c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6l-7-3Z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
        </span>
      );
    default:
      // A party popper — the welcome.
      return (
        <span className="nm-notif-ic text-[#d98324]">
          <svg viewBox="0 0 24 24" className={cls} {...common}>
            <path d="M4 20 9.5 8.5 15.5 14.5 4 20Z" />
            <path d="M14 4.5c.6 1.2 1.8 2.4 3 3M17.5 3c.4.8 1.2 1.6 2 2M19 8.5c.8.4 1.6 1.2 2 2" />
          </svg>
        </span>
      );
  }
}

export default async function NotificationsPage() {
  const session = await getSession();
  if (!session) redirect("/signin?next=%2Fnotifications");

  const rows = await getNotifications(session.user.id);
  const unread = rows.filter((r) => !r.read_at).length;

  return (
    <div className="mx-auto max-w-2xl">
      {/* ── Head ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-1">
        <div className="min-w-0">
          <h1 className="text-[26px] font-extrabold tracking-[-0.03em] text-ink-900 sm:text-[30px]">
            Notifications
          </h1>
          {rows.length > 0 && (
            <p className="mt-1 text-[12.5px] font-medium text-ink-500">
              {unread > 0 ? `${unread} unread` : "You're all caught up."}
            </p>
          )}
        </div>
        {unread > 0 && <MarkAllRead />}
      </div>

      <div className="mt-4">
        <PushOptIn />
      </div>

      {rows.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon="🔔"
            title="No notifications yet"
            body="When you place an order you'll be told at every step — payment confirmed, accepted, shipped, delivered. Announcements from Jova show up here too."
            action="Start shopping"
            href="/"
          />
        </div>
      ) : (
        /* One card, every row. `overflow-hidden` is what lets the first and
           last row take the card's radius without their own corners. */
        <div className="nm-notif-card mt-4 overflow-hidden rounded-[24px] shadow-[0_1px_2px_rgba(16,24,24,.04),0_10px_26px_-16px_rgba(16,24,24,.2)]">
          {rows.map((r) => {
            const inner = (
              <>
                <KindIcon kind={r.kind} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-2">
                    <p
                      className={
                        r.read_at
                          ? "text-[14px] font-semibold leading-snug text-ink-800"
                          : "text-[14px] font-bold leading-snug text-ink-900"
                      }
                    >
                      {r.title}
                    </p>
                    {!r.read_at && (
                      <span
                        className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#0f753c]"
                        aria-label="Unread"
                      />
                    )}
                  </div>
                  {r.body && (
                    <p className="mt-1 text-[12.5px] leading-relaxed text-ink-500">{r.body}</p>
                  )}
                  <p className="mt-1.5 text-[11px] font-medium text-ink-400">{relTime(r.created_at)}</p>
                </div>
              </>
            );

            return r.href ? (
              <Link key={r.id} href={r.href} className="nm-notif-row">
                {inner}
              </Link>
            ) : (
              <div key={r.id} className="nm-notif-row">
                {inner}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
