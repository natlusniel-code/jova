import { redirect } from "next/navigation";

export const metadata = { title: "Sign in" };

/**
 * `/signin` is a permanent redirect to the new LOGIN page, `/auth`.
 *
 * ── Why this is a redirect and not a page ───────────────────────────────────
 * The email + password form that used to live here is gone: Google is the only
 * way in. But `/signin` is linked from roughly thirty places — every
 * `redirect("/signin?next=…")` guard in the shop and seller layouts, the
 * checkout prompt, the wishlist and chat buttons, old emails and bookmarks.
 *
 * Deleting the route would 404 all of them. Redirecting keeps every one of
 * those links working and lands the person on the one screen that can actually
 * sign them in, with their `next` destination preserved.
 */
export default async function SignInPage({
  searchParams: searchParamsPromise,
}: {
  // Next 15: search params arrive as a Promise.
  searchParams: Promise<{ next?: string }>;
}) {
  const searchParams = await searchParamsPromise;
  const raw = searchParams?.next ?? "";
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "";
  redirect(next ? `/auth?next=${encodeURIComponent(next)}` : "/auth");
}
