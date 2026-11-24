"use client";

import { useEffect, useState } from "react";
import { firebaseAuth } from "@/lib/firebase/client";
import { bridgeFirebaseSession } from "@/app/auth/firebase-actions";

export function FirebaseVerifyClient({
  role,
  next,
}: {
  role: "buyer" | "seller";
  next: string | null;
}) {
  const [message, setMessage] = useState("Your email has been verified. Finishing your Jova account…");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    async function finish() {
      try {
        const user = firebaseAuth.currentUser;
        if (!user) {
          if (active) {
            setMessage("Your email is verified. You can now log in to Jova.");
            window.setTimeout(() => window.location.assign("/auth"), 1800);
          }
          return;
        }

        await user.reload();
        if (!user.emailVerified) {
          throw new Error("Your email is not verified yet. Open the verification link from your email.");
        }
        const idToken = await user.getIdToken(true);
        const result = await bridgeFirebaseSession({ idToken, mode: "signup", role, next });
        if (!result.ok) throw new Error(result.error);
        if (active) window.location.assign(result.next);
      } catch (error) {
        if (!active) return;
        setMessage(error instanceof Error ? error.message : "We could not finish your account. Please log in.");
        setFailed(true);
      }
    }
    void finish();
    return () => {
      active = false;
    };
  }, [role, next]);

  return (
    <main className="grid min-h-dvh place-items-center bg-[var(--canvas)] px-5">
      <section className="w-full max-w-md rounded-2xl border border-ink-100 bg-white p-7 text-center shadow-sm">
        <h1 className="font-display text-xl font-extrabold text-ink-900">
          {failed ? "Email verification" : "Email verified"}
        </h1>
        <p role="status" className="mt-3 text-sm leading-relaxed text-ink-600">{message}</p>
        {failed ? (
          <button type="button" onClick={() => window.location.assign("/auth")} className="mt-5 rounded-xl bg-brand-700 px-5 py-3 text-sm font-bold text-white">
            Go to login
          </button>
        ) : null}
      </section>
    </main>
  );
}
