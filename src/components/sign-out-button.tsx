"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { firebaseAuth } from "@/lib/firebase/client";
import { signOutSupabase } from "@/app/auth/clerk-actions";
import { Spinner } from "@/components/ui";

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleSignOut() {
    setBusy(true);
    try {
      await signOutSupabase();
      await signOut(firebaseAuth);
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
