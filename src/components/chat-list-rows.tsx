"use client";

import Link from "next/link";
import { Avatar, Badge } from "@/components/ui";
import { relTime, naira } from "@/lib/utils";
import { useChatListPresence } from "@/components/chat-list-live";

/**
 * The chat rows, with live presence.
 *
 * ── The three states ────────────────────────────────────────────────────
 *   • Online  — a green dot and the word "Online", in green.
 *   • Offline — a grey dot and the word "Offline", in grey.
 *   • Typing  — three dancing dots and "typing…", in green.
 *
 * Typing wins over online: if someone is composing, that is the more
 * useful thing to know. Offline is never shown while typing, because you
 * cannot type into a chat you are not in.
 *
 * ── Why the status replaces the preview line ────────────────────────────
 * The reference puts the status where the message preview would be, and
 * that is the right trade: the preview is already visible in the row's
 * own text, and a status that only appears on hover would be invisible on
 * a phone. When someone is typing, the preview is replaced by "typing…"
 * so the row does not say two things at once.
 */
export type ChatRow = {
  id: string;
  otherId: string;
  name: string;
  avatar: string | null;
  lastBody: string | null;
  lastAt: string;
  mine: boolean;
  unread: number;
  reference: string | null;
  total: number | null;
  unpaid: boolean;
};

function TypingDots() {
  return (
    <span className="inline-flex items-end gap-[3px]" aria-hidden="true">
      <span className="nm-typing-dot !h-1 !w-1" />
      <span className="nm-typing-dot !h-1 !w-1" style={{ animationDelay: "0.15s" }} />
      <span className="nm-typing-dot !h-1 !w-1" style={{ animationDelay: "0.3s" }} />
    </span>
  );
}

export function ChatListRows({ meId, rows }: { meId: string; rows: ChatRow[] }) {
  const { online, typing } = useChatListPresence({
    meId,
    otherIds: rows.map((r) => r.otherId),
  });

  return (
    <div className="overflow-hidden rounded-[22px] bg-white shadow-[0_1px_2px_rgba(16,24,24,.04),0_10px_26px_-16px_rgba(16,24,24,.2)]">
      {rows.map((r, i) => {
        const isTyping = !!typing[r.id];
        const isOnline = online[r.otherId] === "online";
        const status = isTyping ? "typing" : isOnline ? "online" : "offline";

        return (
          <Link
            key={r.id}
            href={`/chats/${r.id}`}
            className={`flex items-start gap-3 px-4 py-3.5 transition hover:bg-[#faf9f6] ${
              i > 0 ? "border-t border-[#f2f0ea]" : ""
            }`}
          >
            {/* The avatar carries the presence ring: a green ring when
                online, nothing when offline. The dot on the row is the
                accessible signal; the ring is the glanceable one. */}
            <span className="relative shrink-0">
              <span
                className={`block rounded-full ${
                  isOnline ? "ring-2 ring-[#0f753c] ring-offset-2 ring-offset-white" : ""
                }`}
              >
                <Avatar name={r.name} src={r.avatar} size={44} />
              </span>
              {isOnline && (
                <span
                  className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-[#0f753c]"
                  aria-hidden="true"
                />
              )}
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate text-[13.5px] font-bold text-ink-900">{r.name}</p>
                <span className="shrink-0 text-[11px] text-ink-400">{relTime(r.lastAt)}</span>
              </div>

              {/* The status line. `aria-live` so a screen reader hears the
                  change once, not on every animation frame. */}
              <p
                className="mt-0.5 flex items-center gap-1.5 text-[11.5px] font-semibold"
                aria-live="polite"
              >
                {status === "typing" ? (
                  <>
                    <TypingDots />
                    <span className="text-[#0f753c]">typing…</span>
                  </>
                ) : status === "online" ? (
                  <>
                    <span className="h-[7px] w-[7px] rounded-full bg-[#0f753c]" aria-hidden="true" />
                    <span className="text-[#0f753c]">Online</span>
                  </>
                ) : (
                  <>
                    <span className="h-[7px] w-[7px] rounded-full bg-[#b6b6b0]" aria-hidden="true" />
                    <span className="text-ink-400">Offline</span>
                  </>
                )}
              </p>

              {r.reference && (
                <p className="mt-1 flex items-center gap-1.5 text-[11px] text-ink-400">
                  <span className="font-mono">{r.reference}</span>
                  <span aria-hidden="true">·</span>
                  <span>{naira(r.total)}</span>
                  {r.unpaid && (
                    <Badge tone="amber" className="!px-1.5 !py-0 !text-[10px]">
                      unpaid
                    </Badge>
                  )}
                </p>
              )}

              <p className="mt-1 truncate text-[12.5px] text-ink-500">
                {r.mine ? "You: " : ""}
                {r.lastBody ?? "No messages yet — say hello 👋"}
              </p>
            </div>

            {r.unread > 0 && (
              <span
                className="mt-1 grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-[#0f753c] px-1.5 text-[10.5px] font-bold text-white"
                aria-label={`${r.unread} unread`}
              >
                {r.unread > 99 ? "99+" : r.unread}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
