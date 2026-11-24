import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/safe-next";

export const dynamic = "force-dynamic";
export const metadata = { title: "Signing you in" };

/**
 * `/auth/continue` \u2014 a legacy entry point, kept as a redirect.
 *
 * \u2500\u2500 What this used to be \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
 * The second half of an OAuth sign-in: a client page that called the bridge
 * and showed a spinner while it ran. That extra hop was the "Fetching your
 * data" screen \u2014 a full page load, a client effect, a server action and a
 * second navigation, with a blank spinner in between and no way out if any of
 * them stalled.
 *
 * \u2500\u2500 Why it now goes to `/auth` \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
 * Under Clerk this forwarded to `/auth/sso-callback`, which completed the
 * Clerk handshake. That route is gone: Firebase's `signInWithRedirect` returns
 * to `/auth` itself, where `getRedirectResult()` finishes the sign-in in the
 * same page load. Forwarding to a deleted route would 404 anyone holding an
 * old link, so this points at the one page that can actually complete a
 * sign-in.
 *
 * `/auth` checks the Supabase session first and sends a signed-in person
 * straight to their destination, so this cannot loop.
 *
 * `?next=` is carried through only when it is safe, so a deep link that
 * started the sign-in still lands where it was going.
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
  redirect(query ? `/auth?${query}` : "/auth");
}
