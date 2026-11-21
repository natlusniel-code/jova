import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/safe-next";

export const dynamic = "force-dynamic";
export const metadata = { title: "Signing you in" };

/**
 * `/auth/continue` — a legacy entry point, kept as a redirect.
 *
 * ── What this used to be ────────────────────────────────────────────────────
 * The second half of an OAuth sign-in: a client page that called the bridge
 * and showed a spinner while it ran. That extra hop was the "Fetching your
 * data" screen — a full page load, a client effect, a server action and a
 * second navigation, with a blank spinner in between and no way out if any of
 * them stalled.
 *
 * The bridge now runs inside `/auth/sso-callback`, in the same page load that
 * completes the handshake, so there is nothing left to do here.
 *
 * ── Why the route still exists ──────────────────────────────────────────────
 * It was the `redirectUrl` handed to Clerk, so it is baked into in-flight OAuth
 * handshakes and into any bookmark or email link made while it was live.
 * Deleting it would 404 those. A redirect costs one hop and keeps them working.
 *
 * `?next=` is carried through only when it is safe, so a deep link that started
 * the sign-in still lands where it was going.
 */
export default async function AuthContinuePage({
  searchParams: searchParamsPromise,
}: {
  // Next 15: search params arrive as a Promise.
  searchParams: Promise<{ mode?: string; role?: string; next?: string }>;
}) {
  const searchParams = await searchParamsPromise;

  const params = new URLSearchParams();
  if (searchParams?.mode === "signup") params.set("mode", "signup");
  if (searchParams?.role === "seller") params.set("role", "seller");

  const next = safeNextPath(searchParams?.next);
  if (next) params.set("next", next);

  const query = params.toString();
  redirect(query ? `/auth/sso-callback?${query}` : "/auth/sso-callback");
}
