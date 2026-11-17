"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const BASE = "/admin-fuckliving";

/**
 * Admin console navigation.
 *
 * Same two-shape approach as the seller hub: a grouped vertical sidebar on
 * desktop, a horizontal chip scroller on a phone. The active row is filled
 * with the brand tint rather than a black pill — the console is a working
 * surface, not a different product, so it uses the same palette as the rest
 * of the app.
 */
const GROUPS: { title: string; items: { href: string; label: string; exact?: boolean }[] }[] = [
  {
    title: "Overview",
    items: [
      { href: BASE, label: "Dashboard", exact: true },
      { href: `${BASE}/orders`, label: "Orders" },
      { href: `${BASE}/disputes`, label: "Disputes" },
    ],
  },
  {
    title: "Money",
    items: [
      { href: `${BASE}/payments`, label: "Payments" },
      { href: `${BASE}/payment-accounts`, label: "Payment accounts" },
      { href: `${BASE}/payouts`, label: "Payouts" },
    ],
  },
  {
    title: "People",
    items: [
      { href: `${BASE}/sellers`, label: "Sellers" },
      { href: `${BASE}/buyers`, label: "Buyers" },
      { href: `${BASE}/reviews`, label: "Reviews" },
    ],
  },
  {
    title: "Operations",
    items: [
      { href: `${BASE}/safety`, label: "Trust & safety" },
      { href: `${BASE}/copilot`, label: "Copilot" },
      { href: `${BASE}/blocked-messages`, label: "Blocked messages" },
      { href: `${BASE}/notifications`, label: "Notifications" },
      { href: `${BASE}/settings`, label: "Settings" },
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
  const key = href.replace(BASE, "").replace("/", "") || "dashboard";
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
    case "orders":
      return (
        <svg viewBox="0 0 24 24" className={className} {...p}>
          <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
          <path d="m4 7.5 8 4.5 8-4.5M12 12v9" />
        </svg>
      );
    case "disputes":
      return (
        <svg viewBox="0 0 24 24" className={className} {...p}>
          <path d="M12 3 2.5 20h19L12 3Z" />
          <path d="M12 9.5v4M12 16.5v.5" />
        </svg>
      );
    case "payments":
    case "payment-accounts":
    case "payouts":
      return (
        <svg viewBox="0 0 24 24" className={className} {...p}>
          <rect x="3.5" y="6.5" width="17" height="12" rx="2.5" />
          <path d="M3.5 10.5h17" />
          <circle cx="12" cy="14.5" r="1.6" />
        </svg>
      );
    case "sellers":
    case "buyers":
      return (
        <svg viewBox="0 0 24 24" className={className} {...p}>
          <circle cx="9" cy="8.5" r="3.2" />
          <path d="M3 20c.6-3.2 3.1-5.2 6-5.2s5.4 2 6 5.2" />
          <path d="M16 5.5a3 3 0 0 1 0 6M18 20c-.2-1.6-.7-3-1.6-4" />
        </svg>
      );
    case "reviews":
      return (
        <svg viewBox="0 0 24 24" className={className} {...p}>
          <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9L12 3.5Z" />
        </svg>
      );
    case "safety":
      return (
        <svg viewBox="0 0 24 24" className={className} {...p}>
          <path d="M12 3 5 6v6c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6l-7-3Z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
    case "copilot":
      return (
        <svg viewBox="0 0 24 24" className={className} {...p}>
          <path d="M12 3.5 13.7 9l5.5 1.7-5.5 1.7L12 18l-1.7-5.6L4.8 10.7 10.3 9 12 3.5Z" />
        </svg>
      );
    case "blocked-messages":
      return (
        <svg viewBox="0 0 24 24" className={className} {...p}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="m6.5 6.5 11 11" />
        </svg>
      );
    case "notifications":
      return (
        <svg viewBox="0 0 24 24" className={className} {...p}>
          <path d="M18 8.5a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16s-2-1.5-2-6.5Z" />
          <path d="M10.3 19a2 2 0 0 0 3.4 0" />
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

export function AdminSidebar() {
  const path = usePathname() || "";
  return (
    <nav className="hidden w-[228px] shrink-0 lg:block">
      <div className="sticky top-[76px] space-y-6">
        {GROUPS.map((g) => (
          <div key={g.title}>
            <p className="mb-2 px-3 text-[10.5px] font-bold uppercase tracking-[0.09em] text-ink-400">
              {g.title}
            </p>
            <ul className="space-y-0.5">
              {g.items.map((it) => {
                const active = it.exact ? path === it.href : path.startsWith(it.href);
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

export function AdminNav() {
  const path = usePathname() || "";
  return (
    <nav className="nm-scroll -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-2.5 lg:hidden">
      {ALL.map((it) => {
        const active = it.exact ? path === it.href : path.startsWith(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? "page" : undefined}
            className={cn("nm-chip shrink-0", active && "nm-chip-active")}
          >
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
