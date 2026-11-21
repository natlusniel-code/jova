import { redirect } from "next/navigation";
import { getSession } from "@/lib/supabase/server";
import { signedInLanding } from "@/lib/auth/landing";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

/**
 * `/dashboard` — a legacy landing page, kept as a redirect.
 *
 * ── What this used to be ────────────────────────────────────────────────────
 * A generic "you are signed in" page: an identity card, a role badge and two
 * quick links. It was where `/auth` sent EVERY signed-in visitor, which was
 * wrong in both directions — a buyer was taken off the storefront, and a seller
 * was taken to a page that was not their hub.
 *
 * ── Why it redirects now ────────────────────────────────────────────────────
 * The role decides where someone belongs, and `signedInLanding` is the one
 * place that rule lives: buyer → storefront, seller → Seller Hub or the
 * onboarding step they are on. Keeping a second, generic destination meant two
 * answers to the same question, and the wrong one was the one people hit.
 *
 * The route still exists because it is in `robots.ts`, in old bookmarks and in
 * any link made while it was live. A redirect costs one hop and keeps them
 * working; deleting it would 404 them.
 */
export default async function DashboardPage() {
  const session = await getSession();

  // Signed out: the login page, which is the only way back in.
  if (!session) redirect("/auth");

  redirect(signedInLanding(session));
}
