"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cartCount, readCart, type Cart } from "@/lib/cart";
import { cn } from "@/lib/utils";

/**
 * The storefront header — reference 1.
 *
 * ── Layout ──────────────────────────────────────────────────────────────
 * Row one: the brand mark (a deep-green rounded square holding a white
 * cart glyph), the wordmark with "Naija" in black and "Mart" in green,
 * then the right-hand cluster — bell, cart, avatar.
 *
 * Row two: the location pills. They are real links to the location
 * picker, so the header is also the way to change where you are
 * shopping from.
 *
 * ── The transparency effect ─────────────────────────────────────────────
 * The bar is a translucent glass panel: a near-white wash at ~82% opacity
 * over a `backdrop-blur`, with a hairline bottom edge that only appears
 * once the page has scrolled. At the top of the page it reads as part of
 * the canvas; scrolled, it separates from the content without ever going
 * opaque or dark. That is the effect in the reference — you can see the
 * page moving underneath it.
 *
 * ── Why the cart lives here ─────────────────────────────────────────────
 * The reference puts a cart in the header, and it is the right place: a
 * buyer who has added something needs one tap to reach it from anywhere.
 * The count is read from the same localStorage cart the rest of the app
 * uses and kept live by the `nm:cart` event, so it never goes stale.
 */
export function ShopHeader({
  signedIn,
  initials,
  avatarUrl,
  city,
  state,
  unreadNotifications,
  isSeller,
  isAdmin,
}: {
  signedIn: boolean;
  initials: string;
  avatarUrl: string | null;
  city: string;
  state: string;
  unreadNotifications: number;
  isSeller: boolean;
  isAdmin: boolean;
}) {
  const path = usePathname() || "/";
  const [cart, setCart] = useState<Cart>({});
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const sync = () => setCart(readCart());
    sync();
    window.addEventListener("nm:cart", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("nm:cart", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  // The hairline only appears once the page has moved, so the header is
  // invisible against the canvas at rest.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const n = cartCount(cart);
  const onCart = path === "/cart";

  return (
    <header
      className={cn(
        "nm-sticky-chrome sticky top-0 z-30 transition-shadow duration-200",
        scrolled ? "shadow-[0_1px_0_rgba(16,24,24,.06),0_8px_24px_-18px_rgba(16,24,24,.35)]" : "",
      )}
      style={{
        // The glass: a warm near-white at 82%, blurred behind. Never black,
        // never fully opaque — the page has to show through it.
        background: "rgba(250,250,248,.82)",
        backdropFilter: "saturate(180%) blur(18px)",
        WebkitBackdropFilter: "saturate(180%) blur(18px)",
      }}
    >
      <div className="mx-auto w-full max-w-7xl px-4 pb-2.5 pt-3 sm:px-6">
        {/* ── Row one ─────────────────────────────────────────────────── */}
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/" className="flex min-w-0 shrink items-center gap-2.5" aria-label="NaijaMart home">
            <span className="nm-head-mark shrink-0">
              <svg
                viewBox="0 0 24 24"
                className="h-[22px] w-[22px]"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M3 4h2.2l2.1 10.4a1.6 1.6 0 0 0 1.6 1.3h8.3a1.6 1.6 0 0 0 1.6-1.3L20.5 7H6" />
                <circle cx="9.5" cy="19.5" r="1.4" />
                <circle cx="17.5" cy="19.5" r="1.4" />
              </svg>
            </span>
            <span className="truncate font-display text-[21px] font-extrabold leading-none tracking-[-0.035em]">
              <span className="text-[#0b0f0f]">Naija</span>
              <span className="font-semibold text-[#006747]">Mart</span>
            </span>
          </Link>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            {isSeller && (
              <Link href="/seller" className="nm-btn-ghost hidden !h-9 !px-3 !text-[12.5px] sm:inline-flex">
                Seller hub
              </Link>
            )}
            {isAdmin && (
              <Link href="/admin-fuckliving" className="nm-btn-ghost hidden !h-9 !px-3 !text-[12.5px] lg:inline-flex">
                Admin
              </Link>
            )}

            {signedIn && (
              <Link
                href="/notifications"
                aria-label={
                  unreadNotifications > 0
                    ? `Notifications, ${unreadNotifications} unread`
                    : "Notifications"
                }
                className="nm-head-btn"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-[19px] w-[19px]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M18 8.5a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16s-2-1.5-2-6.5Z" />
                  <path d="M10.3 19a2 2 0 0 0 3.4 0" />
                </svg>
                {unreadNotifications > 0 && <span className="nm-head-dot" aria-hidden="true" />}
              </Link>
            )}

            {/* The cart. Always present, signed in or not — a guest can fill
                a cart and is asked to sign in at checkout, not before. */}
            <Link
              href="/cart"
              aria-label={n > 0 ? `Cart, ${n} item${n === 1 ? "" : "s"}` : "Cart"}
              aria-current={onCart ? "page" : undefined}
              className={cn("nm-head-btn", onCart && "!bg-[#006747] !text-white")}
            >
              <svg
                viewBox="0 0 24 24"
                className="h-[19px] w-[19px]"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M3 4h2.2l2.1 10.4a1.6 1.6 0 0 0 1.6 1.3h8.3a1.6 1.6 0 0 0 1.6-1.3L20.5 7H6" />
                <circle cx="9.5" cy="19.5" r="1.4" />
                <circle cx="17.5" cy="19.5" r="1.4" />
              </svg>
              {n > 0 && (
                <span
                  className="absolute -right-0.5 -top-0.5 grid h-[17px] min-w-[17px] place-items-center rounded-full bg-[#ff6b4a] px-1 text-[9.5px] font-extrabold leading-none text-white shadow-[0_0_0_2px_#fff]"
                  aria-hidden="true"
                >
                  {n > 9 ? "9+" : n}
                </span>
              )}
            </Link>

            {signedIn ? (
              <Link href="/profile" aria-label="Your profile" className="nm-head-avatar overflow-hidden">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  initials
                )}
              </Link>
            ) : (
              <Link href="/signin" className="nm-btn-primary !h-9 !rounded-full !px-4 !text-[12.5px]">
                Sign in
              </Link>
            )}
          </div>
        </div>

        {/* ── Row two: location pills ─────────────────────────────────── */}
        <div className="nm-scroll mt-2.5 flex items-center gap-2 overflow-x-auto pb-0.5">
          <Link href="/profile/location" className="nm-loc-pill">
            <svg
              viewBox="0 0 24 24"
              className="h-[14px] w-[14px] shrink-0 text-[#006747]"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z" />
              <circle cx="12" cy="10" r="2.5" />
            </svg>
            <span className="truncate">
              {city}, {state}
            </span>
          </Link>
          <Link href="/search" className="nm-loc-pill">
            <svg
              viewBox="0 0 24 24"
              className="h-[14px] w-[14px] shrink-0 text-[#006747]"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="6.5" />
              <path d="m16 16 4.5 4.5" />
            </svg>
            <span className="truncate">Browse all</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
