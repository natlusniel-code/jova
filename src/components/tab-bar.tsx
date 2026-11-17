"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * The floating bottom tab bar — reference 2.
 *
 * ── Shape ───────────────────────────────────────────────────────────────
 * A white pill that floats clear of the bottom edge (10px + the safe-area
 * inset), inset 12px from each side and capped at 520px so it stays a
 * pill on a tablet instead of stretching into a bar. Six items, evenly
 * spaced, icon over label. The active item sits on a sage lozenge with
 * the label and icon in deep green; the rest are muted slate.
 *
 * ── The badge ───────────────────────────────────────────────────────────
 * `unread` is the number of UNREAD MESSAGES, not conversations — the old
 * badge counted threads, so it never cleared after reading one. It is
 * cleared the instant a chat is opened and kept live by a Realtime
 * subscription on `messages`.
 *
 * ── Why it is not in the document flow ──────────────────────────────────
 * It is `position: fixed`, so the page scrolls underneath it. The shop
 * layout reserves bottom padding so the last card is never hidden behind
 * it.
 */
const ITEMS = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/search", label: "Search", icon: "search" },
  { href: "/wishlist", label: "Saved", icon: "heart" },
  { href: "/chats", label: "Chats", icon: "chat" },
  { href: "/orders", label: "Orders", icon: "box" },
  { href: "/profile", label: "Profile", icon: "user" },
];

function Icon({ name, active }: { name: string; active: boolean }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: active ? 2.1 : 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  const cls = "h-[21px] w-[21px]";
  switch (name) {
    case "home":
      return (
        <svg viewBox="0 0 24 24" className={cls} {...common}>
          <path d="M3.5 10.5 12 3.8l8.5 6.7V20a1 1 0 0 1-1 1h-5v-6h-5v6h-5a1 1 0 0 1-1-1v-9.5Z" />
        </svg>
      );
    case "search":
      return (
        <svg viewBox="0 0 24 24" className={cls} {...common}>
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4.5 4.5" />
        </svg>
      );
    case "chat":
      return (
        <svg viewBox="0 0 24 24" className={cls} {...common}>
          <path d="M20.5 12c0 4.1-3.8 7.4-8.5 7.4-1 0-1.9-.15-2.8-.42L4 21l1.3-3.6A7 7 0 0 1 3.5 12C3.5 7.9 7.3 4.6 12 4.6s8.5 3.3 8.5 7.4Z" />
        </svg>
      );
    case "heart":
      return (
        <svg viewBox="0 0 24 24" className={cls} {...common}>
          <path d="M12 20.5s-7.5-4.6-7.5-9.6a4.4 4.4 0 0 1 7.5-3.1 4.4 4.4 0 0 1 7.5 3.1c0 5-7.5 9.6-7.5 9.6Z" />
        </svg>
      );
    case "box":
      return (
        <svg viewBox="0 0 24 24" className={cls} {...common}>
          <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
          <path d="m4 7.5 8 4.5 8-4.5M12 12v9" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" className={cls} {...common}>
          <circle cx="12" cy="8.2" r="3.7" />
          <path d="M4.5 20.5c.7-3.6 3.8-5.8 7.5-5.8s6.8 2.2 7.5 5.8" />
        </svg>
      );
  }
}

export function TabBar({ unread = 0 }: { unread?: number }) {
  const path = usePathname() || "/";
  const [count, setCount] = useState(unread);
  const inChat = path.startsWith("/chats");

  // Server-rendered value wins whenever the layout re-renders.
  useEffect(() => {
    setCount(unread);
  }, [unread]);

  // Opening any chat clears the badge immediately, before the round trip.
  useEffect(() => {
    if (inChat) setCount(0);
  }, [inChat, path]);

  // Live updates: a new message bumps the badge, a read receipt clears it.
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    const refresh = async () => {
      const { data } = await supabase.rpc("unread_message_count");
      if (!cancelled && typeof data === "number") setCount(data);
    };

    const ch = supabase
      .channel("tabbar-unread")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => {
        if (!inChat) refresh();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages" }, () => {
        if (!inChat) refresh();
      })
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [inChat]);

  return (
    <nav className="nm-tabbar" aria-label="Main">
      {ITEMS.map((it) => {
        const active = it.href === "/" ? path === "/" : path.startsWith(it.href);
        const badge = it.href === "/chats" ? count : 0;
        return (
          <Link
            key={it.href}
            href={it.href}
            data-on={active ? "true" : "false"}
            aria-current={active ? "page" : undefined}
            className="nm-tab"
          >
            <span className="relative">
              <Icon name={it.icon} active={active} />
              {badge > 0 && (
                <span className="nm-tab-badge" aria-label={`${badge} unread`}>
                  {badge > 9 ? "9+" : badge}
                </span>
              )}
            </span>
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
