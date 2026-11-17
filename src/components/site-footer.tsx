import Link from "next/link";
import { SupportLink } from "@/components/support-link";
import { SUPPORT_WHATSAPP_DISPLAY } from "@/lib/support";
import { Logo } from "@/components/ui";

/**
 * Site footer.
 *
 * Carries the single "Contact support" entry point for the storefront. It is
 * hidden on the mobile tab-bar breakpoint only in the sense that it sits
 * above the fixed tab bar (the layout already reserves `pb-24`), so it never
 * ends up underneath it.
 *
 * Location sharing deliberately does NOT live here. A footer button is a
 * place nobody looks when they are trying to tell a seller where to deliver,
 * so the entry point moved to the delivery-address block on checkout, where
 * the buyer is already thinking about their address.
 *
 * ── Layout ────────────────────────────────────────────────────────────
 * Four columns on desktop (brand blurb, Shop, Account, Support) that fold
 * to two on a tablet and one on a phone. Every column is a real list of
 * links, so the footer is also the sitemap for anything the top nav does
 * not carry. Generous vertical padding — the footer is a destination, not
 * a strip.
 */
const COLS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Shop",
    links: [
      { href: "/search", label: "Browse everything" },
      // There is no `/shop` index route — only `/shop/[slug]`. The directory
      // of every shop is the search page filtered to verified sellers, so
      // that is what this link points at rather than a 404.
      { href: "/search?verified=1", label: "All shops" },
      { href: "/services", label: "Services" },
      { href: "/wishlist", label: "Saved items" },
    ],
  },
  {
    title: "Account",
    links: [
      { href: "/orders", label: "My orders" },
      { href: "/chats", label: "Messages" },
      { href: "/profile", label: "Profile & settings" },
      { href: "/seller", label: "Sell on NaijaMart" },
    ],
  },
  {
    title: "Support",
    links: [
      { href: "/help", label: "Help centre" },
      { href: "/legal/terms", label: "Terms of service" },
      { href: "/legal/privacy", label: "Privacy policy" },
      { href: "/legal/refunds", label: "Refund policy" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-[var(--line)] bg-white">
      <div className="nm-wrap py-12">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
          {/* Brand column */}
          <div className="max-w-[300px]">
            <Logo />
            <p className="mt-4 text-[13px] leading-relaxed text-ink-500">
              Nigeria&apos;s marketplace for everyday things — buy from verified local sellers, or open
              your own shop and reach buyers across the country.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <span className="nm-badge bg-brand-100 text-brand-800">Escrow protected</span>
              <span className="nm-badge bg-[#f1efe9] text-ink-500">Verified sellers</span>
            </div>
          </div>

          {COLS.map((col) => (
            <div key={col.title}>
              <p className="mb-3.5 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-400">
                {col.title}
              </p>
              <ul className="space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="text-[13px] font-medium text-ink-700 transition hover:text-brand-600"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-[var(--line)] pt-6 text-[12.5px] text-ink-500 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} NaijaMart. Made in Nigeria.</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <SupportLink>Contact support</SupportLink>
            <span className="text-ink-300">·</span>
            <span className="text-ink-400">WhatsApp {SUPPORT_WHATSAPP_DISPLAY}</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
