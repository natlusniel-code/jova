"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOutOfAppwrite } from "@/lib/appwrite/client";
import { signOutEverywhere } from "@/app/auth/google-actions";
import { Spinner } from "@/components/ui";

/**
 * Sign out of BOTH systems, then navigate.
 *
 * ── Why both ────────────────────────────────────────────────────────────────
 * The marketplace reads the Supabase cookie; the Google identity lives in the
 * Appwrite session. Clearing only one leaves the user half signed in — either
 * still able to load seller pages, or still holding an Appwrite session that
 * would silently sign them back in on the next visit to /auth.
 *
 * ── Why every call is awaited ───────────────────────────────────────────────
 * Navigating before `deleteSession` resolves would abort the request, leaving
 * the Appwrite session alive. So both calls complete first, and only then does
 * the router move. A failure in either is swallowed (the local state is gone
 * either way) so the user is never stuck on a page they asked to leave.
 */
export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleSignOut() {
    setBusy(true);
    try {
      await signOutOfAppwrite();
      await signOutEverywhere();
    } finally {
      router.replace("/auth");
      router.refresh();
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
