import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { headers } from "next/headers";
import { INSTALL_CAPTURE_SCRIPT } from "@/lib/install-capture";
import { GlobalLoader } from "@/components/global-loader";
import { GlobalLoaderTriggers } from "@/components/global-loader-triggers";
import { NotificationBridge } from "@/components/notification-bridge";
import "./globals.css";
// Responsive guards, imported separately so globals.css stays as it was.
import "./responsive-guards.css";
// Remaps the app's older cool-grey utilities onto the warm palette. Imported
// after globals.css so it wins on cascade order. See the file's own comment.
import "./legacy-palette.css";

// The reference components — the glass header, the floating tab bar, the
// seller card, the swipe gallery, the chat shell, the notification rows,
// the compact footer and the profile cards. Imported last so these rules
// win where they overlap the base system. See the file's own comment.
import "./reference.css";

/**
 * The absolute origin this page is being served from.
 *
 * ── Why this reads the request instead of an env var ──────────────────────
 * The share card showed an empty image slot, and the cause was not the tags:
 * `og:image` pointed at `https://jova.ng/og-image.jpg`, and `jova.ng` has no
 * DNS record at all. Both `NEXT_PUBLIC_SITE_URL` and Vercel's own
 * `VERCEL_PROJECT_PRODUCTION_URL` were set to that dead domain, so every
 * scraper was handed a URL it could not fetch and reported "no image".
 *
 * No environment variable can be trusted here, because the failure mode is
 * precisely "the configured domain is not live yet". The request's own `Host`
 * header cannot be wrong: it is the domain the visitor actually reached, so
 * the image URL is guaranteed to resolve for the same person who is sharing
 * the link.
 *
 * Order:
 *   1. `x-forwarded-host` / `host` — the real request host. Always correct.
 *   2. `NEXT_PUBLIC_SITE_URL` — for a build that renders outside a request
 *      (a static export, a script).
 *   3. The Vercel production host, then a literal, as last resorts.
 *
 * When jova.ng is pointed at Vercel, this starts emitting jova.ng on its own,
 * with no code change and no redeploy.
 */
function siteOrigin(): string {
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) {
    // https unless this really is a local dev host. Trusting
    // `x-forwarded-proto` alone is not enough: a proxy that omits it (or a
    // local `next start`) yields `http`, and an `og:image` on http is either
    // rejected or triggers a mixed-content warning in the preview.
    const isLocal = host.startsWith("localhost") || host.startsWith("127.0.0.1");
    const proto = isLocal ? "http" : "https";
    return `${proto}://${host}`;
  }
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  return "https://naijamart-marketplace-opal.vercel.app";
}

export function generateMetadata(): Metadata {
  return {
    // `metadataBase` turns the relative OG image path below into the absolute
    // URL that WhatsApp, X and Facebook require. Without it Next emits a
    // relative `og:image` and every scraper silently drops the preview.
    metadataBase: new URL(siteOrigin()),
    alternates: {
      canonical: "/",
    },
  title: {
    default: "Jova Marketplace — buy and hire from verified sellers in your state",
    template: "%s · Jova Marketplace",
  },
  description:
    "Jova Marketplace is a Nigerian marketplace for goods and services. We hold your money in escrow until you confirm delivery.",
  applicationName: "Jova Marketplace",
  authors: [{ name: "Jova Marketplace" }],
  keywords: [
    "Jova",
    "Jova Marketplace",
    "Nigeria marketplace",
    "buy and sell Nigeria",
    "hire services Nigeria",
    "escrow marketplace",
  ],
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: ["/favicon.ico"],
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Jova",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
  // ── Share card ────────────────────────────────────────────────────────
  // One 1200×630 image for every surface. `summary_large_image` is what makes
  // X draw it full width instead of as a thumbnail beside the text.
  openGraph: {
    type: "website",
    siteName: "Jova Marketplace",
    title: "Jova Marketplace — buy and hire from verified sellers",
    description:
      "Buy and hire from verified sellers in your state. Escrow-protected, so you pay only when you accept.",
    url: "/",
    locale: "en_NG",
    images: [
      {
        url: "/og-image.jpg",
        // `type` is not required by the spec, but several fetchers (WhatsApp's
        // in particular) are stricter than the spec and will skip an image they
        // cannot type from the URL alone.
        //
        // No `secureUrl`: Next does not resolve that field against
        // `metadataBase`, so it emitted a relative `/og-image.jpg` — which is
        // worse than omitting it, because a fetcher that prefers `secure_url`
        // would then have a URL it cannot fetch. `og:image` above is already
        // absolute and https, which is all the spec asks for.
        type: "image/jpeg",
        width: 1200,
        height: 630,
        alt: "Jova Marketplace — buy and hire from verified sellers in your state",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Jova Marketplace — buy and hire from verified sellers",
    description:
      "Buy and hire from verified sellers in your state. Escrow-protected, so you pay only when you accept.",
    images: [{ url: "/og-image.jpg", alt: "Jova Marketplace" }],
  },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0B7A45",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/*
          Captures Chrome's `beforeinstallprompt` before React hydrates.

          The event can fire before any component mounts, and it is
          single-use — if nothing is listening when it fires, the ability to
          show the install dialog from our own "Install app" button is gone
          for that page load. This inline listener stashes it on `window` so
          the toast and the profile row can use it later. See
          src/lib/install-app.ts.
        */}
        <script dangerouslySetInnerHTML={{ __html: INSTALL_CAPTURE_SCRIPT }} />
        {/* ── Type ────────────────────────────────────────────────────────
            Plus Jakarta Sans for headings, Inter for body copy. Loaded from
            Google Fonts with `display=swap` so the first paint is never
            blocked by a font request; the CSS variables in globals.css name
            both families with a system fallback behind them. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&family=Inter:wght@400;500;600;700&display=swap"
        />
      </head>
      <body>
        {/*
          Global loading overlay — one instance for the entire site.

          `GlobalLoaderTriggers` is what decides when it shows: link clicks,
          router.push, back/forward, and every same-origin fetch. It is wrapped
          in Suspense because it reads `useSearchParams`, which would otherwise
          opt the whole layout out of static rendering.
        */}
        <Suspense fallback={null}>
          <GlobalLoaderTriggers />
        </Suspense>
        <GlobalLoader />
        {/* Registers this device for background push and raises an OS
            notification for a new row while the tab is open. In the ROOT
            layout so buyers, sellers and admins all get it. */}
        <NotificationBridge />
        {children}
      </body>
    </html>
  );
}
