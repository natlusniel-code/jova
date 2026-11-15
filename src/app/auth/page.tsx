import { redirect } from "next/navigation";
import { AuthSplit } from "@/components/auth-split";
import { getSession } from "@/lib/supabase/server";
import { GoogleAuthPanel } from "@/components/google-auth-panel";

export const metadata = { title: "Sign in" };

/**
 * `/auth` — the single entry point into NaijaMart.
 *
 * ── The guard ───────────────────────────────────────────────────────────────
 * `getSession()` runs on the server BEFORE anything renders. If the visitor
 * already has a Supabase session we redirect to /dashboard, so a signed-in user
 * never sees a sign-in screen. Doing this server-side (rather than in a
 * `useEffect`) means there is no flash of the auth UI before the redirect.
 *
 * ── Why this is now the only auth page ──────────────────────────────────────
 * Email sign-up, email sign-in, the verification code and the password reset
 * have all been removed. Google is the only identity provider, so there is one
 * screen, one action, and no reason to split "sign in" from "sign up" — the
 * server creates the account if it is new and reuses it if it is not.
 *
 * `/signin` and `/signup` still exist as thin redirects to this page, because
 * they are linked from dozens of places (every `redirect("/signin?next=…")`
 * guard, old emails, bookmarks). Redirecting keeps those links working without
 * leaving a second, half-dead auth surface in the app.
 */
export default async function AuthPage({
  searchParams,
}: {
  searchParams?: { next?: string; role?: string };
}) {
  const session = await getSession();
  if (session) redirect("/dashboard");

  // Only a same-origin relative path is carried through the OAuth round trip.
  const raw = searchParams?.next ?? "";
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : undefined;

  // A seller link (`/signup?role=seller`) preselects the seller card.
  const initialRole = searchParams?.role === "seller" ? "seller" : "buyer";

  return (
    <AuthSplit>
      <GoogleAuthPanel next={next} initialRole={initialRole} />
    </AuthSplit>
  );
}
