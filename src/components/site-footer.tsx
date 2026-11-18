import Link from "next/link";
import { SupportLink } from "@/components/support-link";
import { SUPPORT_WHATSAPP_DISPLAY } from "@/lib/support";

/**
 * Site footer — reference 6.
 *
 * ── Why it is two lines and not four columns ────────────────────────────
 * The previous footer was a tall four-column sitemap: a brand blurb, then
 * Shop / Account / Support lists, then a rule and a copyright row. On a
 * phone that stacked into a long vertical wall that pushed the tab bar
 * down and made every page feel like it ended in a directory.
 *
 * The reference is the opposite: one row of links, one row of contact and
 * copyright, generous vertical padding, and nothing else. Every
 * destination the old columns carried is still reachable — the links
 * below cover browse, orders, help and policies, and the profile page
 * carries the rest — but the footer is now a strip, not a page.
 *
 * ── The WhatsApp line ───────────────────────────────────────────────────
 * It is the single support entry point on the storefront, and it is a
 * real `tel:`/WhatsApp link rather than plain text, so tapping it on a
 * phone opens the conversation.
 */
const LINKS = [
  { href: "/help", label: "Help & support" },
  { href: "/search", label: "Browse" },
  { href: "/orders", label: "My orders" },
  { href: "/legal/terms", label: "Policies" },
];

export function SiteFooter() {
  return (
    <footer className="nm-foot mt-14">
      <div className="mx-auto w-full max-w-7xl px-4 py-9 sm:px-6">
        {/* Row one — the links. Wraps on a narrow phone rather than
            scrolling, so nothing is ever cut off. */}
        <nav className="flex flex-wrap items-center gap-x-7 gap-y-2.5" aria-label="Footer">
          <Link href="/" className="text-[14px] font-extrabold tracking-[-0.02em] text-[#1a1a1a]">
            Jova
          </Link>
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="nm-foot-link">
              {l.label}
            </Link>
          ))}
        </nav>

        {/* Row two — contact and copyright, separated by a mid-dot. */}
        <div className="mt-5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[13px] text-[#595959]">
          <SupportLink className="!gap-1.5 !font-medium !text-[#595959] hover:!text-[#0f753c] hover:!no-underline [&>svg]:!h-[15px] [&>svg]:!w-[15px] [&>svg]:!text-[#202124]">
            WhatsApp {SUPPORT_WHATSAPP_DISPLAY}
          </SupportLink>
          <span aria-hidden="true" className="text-[#b9b4a8]">
            •
          </span>
          <span>© {new Date().getFullYear()} Jova</span>
        </div>
      </div>
    </footer>
  );
}
