"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * The Seller Hub's own navigation.
 *
 * Chats and Notifications live here rather than in the storefront: a seller is
 * redirected out of the storefront, so the buyer tab bar is not available to
 * them. Everything a seller needs to run the shop is reachable from this list.
 *
 * ── Two shapes, one list ──────────────────────────────────────────────
 * On desktop this is a vertical sidebar: grouped sections, an icon per row,
 * and the active row filled with the brand tint. On a phone the same list
 * becomes a horizontal scroller under the header, because a 240px sidebar
 * would eat the whole screen. Both read from `GROUPS`, so a new page is
 * added once and appears in both.
 */
type Item = { href: string; label: string; exact?: boolean; badge?: "messages" };

const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: "Overview",
    items: [
      { href: "/seller", label: "Dashboard", exact: true },
      { href: "/seller/analytics", label: "Analytics" },
      { href: "/seller/notifications", label: "Notifications" },
    ],
  },
  {
    title: "Selling",
    items: [
      { href: "/seller/orders", label: "Orders" },
      { href: "/seller/listings", label: "Listings" },
      { href: "/seller/chats", label: "Chats", badge: "messages" },
      { href: "/seller/reviews", label: "Reviews" },
    ],
  },
  {
    title: "Business",
    items: [
      { href: "/seller/payouts", label: "Payouts" },
      { href: "/seller/subscription", label: "Subscription" },
      { href: "/seller/settings", label: "Settings" },
    ],
  },
];

const ALL = GROUPS.flatMap((g) => g.items);

function Icon({ href, className }: { href: string; className?: string }) {
  const p = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  const key = href.replace("/seller", "").replace("/", "") || "dashboard";
  switch (key) {
    case "dashboard":
      return (
        <svg viewBox="0 0 24 24" className={className} {...p}>
          <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
          <rect x="13.5" y="3.5" width="7" height="7" rx="2" />
          <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
          <rect x="13.5" y="13.5" width="7" height="7" rx="2" />
        </svg>
      );
    case "analytics":
      return (
        <svg viewBox="0 0 24 24" className={className} {...p}>
          <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
        </svg>
      );
    case "notifications":
      return (
        <svg viewBox="0 0 24 24" className={className} {...p}>
          <path d="M18 8.5a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16s-2-1.5-2-6.5Z" />
          <path d="M10.3 19a2 2 0 0 0 3.4 0" />
        </svg>
      );
    case "orders":
      return (
        <svg viewBox="0 0 24 24" className={className} {...p}>
          <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
          <path d="m4 7.5 8 4.5 8-4.5M12 12v9" />
        </svg>
      );
    case "listings":
      return (
        <svg viewBox="0 0 24 24" className={className} {...p}>
          <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
          <path d="M3.5 9.5h17M8 4.5v5" />
        </svg>
      );
    case "chats":
      return (
        <svg viewBox="0 0 24 24" className={className} {...p}>
          <path d="M20.5 12c0 4.1-3.8 7.4-8.5 7.4-1 0-1.9-.15-2.8-.42L4 21l1.3-3.6A7 7 0 0 1 3.5 12C3.5 7.9 7.3 4.6 12 4.6s8.5 3.3 8.5 7.4Z" />
        </svg>
      );
    case "reviews":
      return (
        <svg viewBox="0 0 24 24" className={className} {...p}>
          <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9L12 3.5Z" />
        </svg>
      );
    case "payouts":
      return (
        <svg viewBox="0 0 24 24" className={className} {...p}>
          <rect x="3.5" y="6.5" width="17" height="12" rx="2.5" />
          <path d="M3.5 10.5h17" />
          <circle cx="12" cy="14.5" r="1.6" />
        </svg>
      );
    case "subscription":
      return (
        <svg viewBox="0 0 24 24" className={className} {...p}>
          <path d="M12 3.5 14.6 9l5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.9 9.4 9 12 3.5Z" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" className={className} {...p}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 4.1a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 11a2 2 0 1 1 0 4Z" />
        </svg>
      );
  }
}

/** Desktop sidebar. */
export function SellerSidebar({ unreadMessages = 0 }: { unreadMessages?: number }) {
  const path = usePathname() || "";
  return (
    <nav className="hidden w-[236px] shrink-0 lg:block">
      <div className="sticky top-[76px] space-y-6">
        {GROUPS.map((g) => (
          <div key={g.title}>
            <p className="mb-2 px-3 text-[10.5px] font-bold uppercase tracking-[0.09em] text-ink-400">
              {g.title}
            </p>
            <ul className="space-y-0.5">
              {g.items.map((it) => {
                const active = it.exact ? path === it.href : path.startsWith(it.href);
                const badge = it.badge === "messages" ? unreadMessages : 0;
                return (
                  <li key={it.href}>
                    <Link
                      href={it.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-2.5 rounded-[11px] px-3 py-2 text-[13px] font-semibold transition",
                        active
                          ? "bg-brand-100 text-brand-800"
                          : "text-ink-700 hover:bg-white hover:text-ink-900",
                      )}
                    >
                      <Icon href={it.href} className={cn("h-[17px] w-[17px] shrink-0", active ? "text-brand-600" : "text-ink-400")} />
                      <span className="truncate">{it.label}</span>
                      {badge > 0 && (
                        <span className="ml-auto grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[#e2542f] px-1 text-[10px] font-bold text-white">
                          {badge > 9 ? "9+" : badge}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}

/** Mobile horizontal scroller, shown under the header below `lg`. */
export function SellerNav({ unreadMessages = 0 }: { unreadMessages?: number }) {
  const path = usePathname() || "";
  return (
    <nav className="nm-scroll -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-2.5 lg:hidden">
      {ALL.map((it) => {
        const active = it.exact ? path === it.href : path.startsWith(it.href);
        const badge = it.badge === "messages" ? unreadMessages : 0;
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? "page" : undefined}
            className={cn("nm-chip shrink-0", active && "nm-chip-active")}
          >
            {it.label}
            {badge > 0 && (
              <span className="ml-0.5 grid h-[17px] min-w-[17px] place-items-center rounded-full bg-[#e2542f] px-1 text-[9.5px] font-bold text-white">
                {badge > 9 ? "9+" : badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
