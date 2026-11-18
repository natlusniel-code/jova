import type { MetadataRoute } from "next";

/**
 * robots.txt.
 *
 * There was none, so `/robots.txt` returned the 404 page — which is how a
 * crawler learns nothing about the site and, worse, how a link-preview fetcher
 * can end up caching a "not found" for the host. The rules are deliberately
 * permissive: this is a public marketplace and every listing is meant to be
 * indexed. Only the signed-in areas are closed, because they render nothing
 * useful to a crawler and would just be a wall of redirects.
 */
export default function robots(): MetadataRoute.Robots {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "https://naijamart-marketplace-opal.vercel.app");

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/admin-fuckliving",
          "/dashboard",
          "/seller",
          "/checkout",
          "/cart",
          "/chats",
          "/orders",
          "/notifications",
          "/profile",
          "/wishlist",
        ],
      },
    ],
    // No `sitemap` line: there is no sitemap route in this app, and pointing
    // crawlers at a URL that 404s is worse than saying nothing.
    host: base,
  };
}
