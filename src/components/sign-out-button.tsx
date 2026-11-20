"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import { signOutSupabase } from "@/app/auth/clerk-actions";
import { Spinner } from "@/components/ui";
import { CLERK_CONFIGURED } from "@/lib/clerk/config";

/**
 * Sign out of BOTH systems, then navigate.
 *
 * ── Why both ────────────────────────────────────────────────────────────────
 * The marketplace reads the Supabase cookie; the identity now lives in the
 * Clerk session. Clearing only one leaves the user half signed in — either
 * still able to load seller pages, or still holding a Clerk session that would
 * silently sign them back in on the next visit to /auth.
 *
 * ── Why every call is awaited ───────────────────────────────────────────────
 * Navigating before the Supabase cookie is cleared would abort the request and
 * leave the session alive. So both calls complete first, and only then does the
 * router move. A failure in either is swallowed (the local state is gone
 * either way) so the user is never stuck on a page they asked to leave.
 */
export function SignOutButton() {
  // `useClerk` throws without a provider, and the provider is only mounted when
  // a publishable key exists. Without one there is no Clerk session to clear,
  // so the Supabase-only path is the whole job.
  if (!CLERK_CONFIGURED) return <SupabaseOnlySignOut />;
  return <SignOutButtonInner />;
}

/** Sign-out for a deployment with no Clerk key: clear the Supabase cookie. */
function SupabaseOnlySignOut() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleSignOut() {
    setBusy(true);
    try {
      await signOutSupabase();
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

function SignOutButtonInner() {
  const router = useRouter();
  const { signOut } = useClerk();
  const [busy, setBusy] = useState(false);

  async function handleSignOut() {
    setBusy(true);
    try {
      // Supabase first: it is the one the server reads, and it is the one whose
      // failure would leave a usable session behind.
      await signOutSupabase();
      await signOut();
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
