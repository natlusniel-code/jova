"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOutAction } from "@/app/auth/actions";
import { Spinner } from "@/components/ui";

/**
 * Sign out.
 *
 * There is one session now — the Supabase one — so signing out is a single
 * server action that clears the auth cookies. No second provider to sign out
 * of, and therefore no way for the two to disagree about whether the user is
 * still signed in.
 */
export function SignOutButton() {
  const router = useRouter();
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
