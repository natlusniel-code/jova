import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * The storefront's listing tabs.
 *
 * The blueprint draws the product listing and the service listing as two
 * tabs of one section — "Product Listing" and "Service Gig" side by side
 * — with a "See more" link that leads to the full sub page. Both are
 * rendered as links rather than client-side state so the tab survives a
 * refresh, can be shared, and works without JavaScript.
 *
 * The tabs are pill-shaped rather than underlined: on the warm canvas a
 * filled pill reads as the active filter far more clearly than a 2px rule,
 * and it matches the category chips directly above it.
 */
export function ListingTabs({
  current,
  productHref,
  serviceHref,
  seeMoreHref,
  seeMoreLabel = "See more",
}: {
  current: "product" | "service";
  productHref: string;
  serviceHref: string;
  seeMoreHref: string;
  seeMoreLabel?: string;
}) {
  const tabs = [
    { key: "product" as const, label: "Products", href: productHref },
    { key: "service" as const, label: "Services", href: serviceHref },
  ];

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-white p-1 shadow-card">
        {tabs.map((t) => {
          const active = t.key === current;
          return (
            <Link
              key={t.key}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "rounded-full px-4 py-1.5 text-[13px] font-bold transition",
                active ? "bg-brand-500 text-white shadow-sm" : "text-ink-500 hover:text-ink-900",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      <Link href={seeMoreHref} className="nm-sec-link">
        {seeMoreLabel}
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h13M13 6l6 6-6 6" />
        </svg>
      </Link>
    </div>
  );
}
