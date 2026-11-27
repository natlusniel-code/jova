"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import { signOutAction } from "@/app/auth/actions";
import { Spinner } from "@/components/ui";

/**
 * Sign out.
 *
 * There are TWO sessions now and they must be cleared together: the Supabase
 * one (which every query uses) and the Clerk one (which is the identity).
 *
 * ── Why the order matters ──────────────────────────────────────────────────
 * The server action clears the Supabase cookie first, then revokes the Clerk
 * session. If Clerk were cleared first, the next page load would find a live
 * Supabase cookie with no Clerk identity behind it — a session nobody can
 * explain and nobody can revoke. Clearing Supabase first means the worst case
 * is a Clerk session with no data access, which the next sign-in simply reuses.
 *
 * `clerk.signOut()` is also called in the browser so Clerk's own client state
 * and cookie are dropped even if the server call failed.
 */
export function SignOutButton() {
  const router = useRouter();
  const clerk = useClerk();
  const [busy, setBusy] = useState(false);

  async function handleSignOut() {
    setBusy(true);
    try {
      await signOutAction();
    } catch {
      // The action redirects; a throw here means the cookie clear failed.
      // Still navigate away so the user is not stuck on a signed-in shell.
      router.replace("/auth");
      router.refresh();
    } finally {
      // Drop Clerk's client-side session too. `signOutAction` already revoked
      // it server-side; this clears the browser's copy.
      try {
        await clerk.signOut({ redirectUrl: "/" });
      } catch {
        /* already signed out server-side */
      }
    }
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={busy}
      aria-busy={busy}
      className="nm-btn-ghost px-3.5 py-2 text-[13.5px]"
    >
      {busy ? <Spinner /> : null}
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
