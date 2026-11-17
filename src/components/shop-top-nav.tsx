"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * The storefront's primary navigation.
 *
 * A client component only because it needs `usePathname` to mark the
 * current section. The links themselves are plain `<Link>`s, so the nav
 * still works with JavaScript disabled and every entry is a real URL.
 */
const ITEMS = [
  { href: "/", label: "Home", exact: true },
  { href: "/search", label: "Browse" },
  { href: "/services", label: "Services" },
  { href: "/orders", label: "Orders" },
];

export function ShopTopNav({ className }: { className?: string }) {
  const path = usePathname() || "/";
  return (
    <nav className={cn("items-center gap-0.5", className)}>
      {ITEMS.map((it) => {
        const active = it.exact ? path === it.href : path.startsWith(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-[10px] px-3 py-2 text-[13.5px] font-semibold transition",
              active
                ? "bg-brand-100 text-brand-800"
                : "text-ink-700 hover:bg-white hover:text-ink-900",
            )}
          >
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
