import { redirect } from "next/navigation";
import Link from "next/link";
import { AuthSplit } from "@/components/auth-split";
import { getSession } from "@/lib/supabase/server";
import { AuthGooglePanel } from "@/components/auth-google-panel";

export const metadata = { title: "Sign in" };

/**
 * `/auth` — the signed-out auth screen.
 *
 * ── The guard ───────────────────────────────────────────────────────────────
 * `getSession()` runs on the server BEFORE anything renders. If the visitor
 * already has a Supabase session we redirect to /dashboard, so a signed-in user
 * never sees a sign-in screen. Doing this server-side (rather than in a
 * `useEffect`) means there is no flash of the auth UI before the redirect.
 *
 * ── Why it reuses AuthSplit ─────────────────────────────────────────────────
 * The brief says keep the existing design, fonts and colours. AuthSplit is the
 * same two-panel shell the password sign-in uses — brand panel on the left,
 * form on the right, collapsing to a single column on mobile — so this page
 * looks like it was always part of the site.
 */
export default async function AuthPage() {
  const session = await getSession();
  if (session) redirect("/dashboard");

  return (
    <AuthSplit>
      <AuthGooglePanel />
    </AuthSplit>
  );
}
