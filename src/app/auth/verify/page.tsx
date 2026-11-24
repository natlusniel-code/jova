"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { applyActionCode } from "firebase/auth";
import { firebaseAuth } from "@/lib/firebase/client";
import { bridgeFirebaseSession } from "@/app/auth/firebase-actions";

export default function VerifyEmailPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [message, setMessage] = useState("Verifying your email…");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    async function verify() {
      const code = params.get("oobCode");
      if (!code) {
        setMessage("The verification link is incomplete. Please log in after verifying your email.");
        setFailed(true);
        return;
      }

      try {
        await applyActionCode(firebaseAuth, code);
        const user = firebaseAuth.currentUser;
        if (user) {
          await user.reload();
          const idToken = await user.getIdToken(true);
          const role = params.get("role") === "seller" ? "seller" : "buyer";
          const next = params.get("next");
          const result = await bridgeFirebaseSession({
            idToken,
            mode: "signup",
            role,
            next,
          });
          if (!result.ok) throw new Error(result.error);
          if (active) router.replace(result.next);
          return;
        }

        if (active) {
          setMessage("Your email is verified. You can now log in to Jova.");
          window.setTimeout(() => router.replace("/auth"), 1800);
        }
      } catch (error) {
        if (!active) return;
        setMessage(error instanceof Error ? error.message : "We could not verify this link. Please request a new one.");
        setFailed(true);
      }
    }
    void verify();
    return () => {
      active = false;
    };
  }, [params, router]);

  return (
    <main className="grid min-h-dvh place-items-center bg-[var(--canvas)] px-5">
      <section className="w-full max-w-md rounded-2xl border border-ink-100 bg-white p-7 text-center shadow-sm">
        <h1 className="font-display text-xl font-extrabold text-ink-900">
          {failed ? "Email verification" : "Verifying your email"}
        </h1>
        <p role="status" className="mt-3 text-sm leading-relaxed text-ink-600">{message}</p>
        {failed ? (
          <button type="button" onClick={() => router.replace("/auth")} className="mt-5 rounded-xl bg-brand-700 px-5 py-3 text-sm font-bold text-white">
            Go to login
          </button>
        ) : null}
      </section>
    </main>
  );
}
