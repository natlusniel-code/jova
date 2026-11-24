"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  OAuthProvider,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signInWithEmailAndPassword,
  getRedirectResult,
  signInWithRedirect,
} from "firebase/auth";
import { firebaseAuth } from "@/lib/firebase/client";
import { bridgeFirebaseSession } from "@/app/auth/firebase-actions";

type Role = "buyer" | "seller";

async function finishFirebaseSignIn(
  user: import("firebase/auth").User,
  mode: "signin" | "signup",
  role: Role,
  next: string | undefined,
) {
  const idToken = await user.getIdToken(true);
  return bridgeFirebaseSession({ idToken, mode, role, next });
}

export function FirebaseAuthPanel({
  mode,
  next,
  initialRole = "buyer",
}: {
  mode: "signin" | "signup";
  next?: string;
  initialRole?: Role | null;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>(initialRole ?? "buyer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    async function finishRedirectSignIn() {
      try {
        const result = await getRedirectResult(firebaseAuth);
        if (!result || !active) return;
        if (!result.user.emailVerified) {
          setNotice("Check your email and click the verification link before signing in.");
          return;
        }
        const idToken = await result.user.getIdToken(true);
        const bridged = await bridgeFirebaseSession({
          idToken,
          mode,
          role,
          next,
        });
        if (!active) return;
        if (!bridged.ok) {
          setError(bridged.error);
          return;
        }
        router.replace(bridged.next);
        router.refresh();
      } catch (e) {
        if (!active) return;
        setError(e instanceof Error ? e.message : "Sign-in failed. Please try again.");
      }
    }
    void finishRedirectSignIn();
    return () => {
      active = false;
    };
  }, [mode, role, next, router]);

  async function complete(user: import("firebase/auth").User, authMode: "signin" | "signup") {
    if (!user.emailVerified) {
      setNotice("Check your email and click the verification link before signing in.");
      return;
    }
    const result = await finishFirebaseSignIn(user, authMode, role, next);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.replace(result.next);
    router.refresh();
  }

  async function withBusy(task: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await task();
    } catch (e) {
      const code = (e as { code?: string })?.code;
      const messages: Record<string, string> = {
        "auth/email-already-in-use": "An account already exists with this email. Please log in.",
        "auth/invalid-credential": "Your email or password is incorrect.",
        "auth/weak-password": "Choose a password with at least 6 characters.",
        "auth/popup-closed-by-user": "The sign-in window was closed before completion.",
        "auth/account-exists-with-different-credential": "An account already exists with this email using another sign-in method.",
        "auth/operation-not-allowed": "This sign-in method is not enabled in Firebase yet.",
      };
      setError(messages[code ?? ""] ?? (e instanceof Error ? e.message : "Sign-in failed. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  async function submitEmail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await withBusy(async () => {
      if (mode === "signup") {
        const credential = await createUserWithEmailAndPassword(firebaseAuth, email.trim(), password);
        await sendEmailVerification(credential.user, {
          url: `${window.location.origin}/auth/verify?role=${role}${next ? `&next=${encodeURIComponent(next)}` : ""}`,
          handleCodeInApp: true,
        });
        setNotice("We've sent you a verification link. Open it to verify your email, then log in.");
        return;
      }

      const credential = await signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
      await complete(credential.user, "signin");
    });
  }

  async function social(provider: "google" | "apple") {
    await withBusy(async () => {
      const authProvider =
        provider === "google"
          ? new GoogleAuthProvider()
          : new OAuthProvider("apple.com");
      authProvider.setCustomParameters({ prompt: "select_account" });
      if (provider === "apple") {
        authProvider.addScope("email");
        authProvider.addScope("name");
      }
      await signInWithRedirect(firebaseAuth, authProvider);
    });
  }

  return (
    <div className="w-full">
      <div className="mb-6">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-brand-700">
          {mode === "signup" ? "Join Jova" : "Welcome back"}
        </p>
        <h1 className="mt-2 font-display text-[27px] font-extrabold tracking-[-0.035em] text-ink-900">
          {mode === "signup" ? "Create your account" : "Log in to Jova"}
        </h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-500">
          {mode === "signup"
            ? "Create one account to buy, sell and hire on Jova."
            : "Continue to your Jova marketplace account."}
        </p>
      </div>

      {mode === "signup" ? (
        <div className="mb-4">
          <p className="mb-2 text-[12px] font-bold text-ink-700">I want to</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setRole("buyer")} className={`rounded-xl border px-3 py-3 text-[13px] font-bold ${role === "buyer" ? "border-brand-600 bg-brand-50 text-brand-700" : "border-ink-200 text-ink-600"}`}>
              Buy on Jova
            </button>
            <button type="button" onClick={() => setRole("seller")} className={`rounded-xl border px-3 py-3 text-[13px] font-bold ${role === "seller" ? "border-brand-600 bg-brand-50 text-brand-700" : "border-ink-200 text-ink-600"}`}>
              Sell on Jova
            </button>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <button type="button" disabled={busy} onClick={() => void social("google")} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-ink-200 bg-white px-3 text-[13px] font-bold text-ink-800 disabled:opacity-50">
          <span aria-hidden>G</span> Google
        </button>
        <button type="button" disabled={busy} onClick={() => void social("apple")} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-ink-200 bg-white px-3 text-[13px] font-bold text-ink-800 disabled:opacity-50">
          <span aria-hidden>●</span> Apple
        </button>
      </div>

      <div className="my-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-ink-100" />
        <span className="text-[11px] font-semibold text-ink-400">OR CONTINUE WITH EMAIL</span>
        <span className="h-px flex-1 bg-ink-100" />
      </div>

      <form onSubmit={submitEmail} className="space-y-3">
        <label className="block">
          <span className="mb-1.5 block text-[12px] font-bold text-ink-700">Email address</span>
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="min-h-12 w-full rounded-xl border border-ink-200 bg-white px-3.5 text-[14px] outline-none focus:border-brand-600" placeholder="you@example.com" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[12px] font-bold text-ink-700">Password</span>
          <input type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} className="min-h-12 w-full rounded-xl border border-ink-200 bg-white px-3.5 text-[14px] outline-none focus:border-brand-600" placeholder="At least 6 characters" />
        </label>
        {error ? <p role="alert" className="rounded-xl bg-red-50 px-3 py-2.5 text-[12.5px] text-red-700">{error}</p> : null}
        {notice ? <p role="status" className="rounded-xl bg-emerald-50 px-3 py-2.5 text-[12.5px] text-emerald-800">{notice}</p> : null}
        <button type="submit" disabled={busy} className="flex min-h-12 w-full items-center justify-center rounded-xl bg-brand-700 px-4 text-[14px] font-extrabold text-white disabled:opacity-60">
          {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Log in"}
        </button>
      </form>

      <p className="mt-5 text-center text-[13px] text-ink-500">
        {mode === "signup" ? "Already have an account? " : "New to Jova? "}
        <Link href={mode === "signup" ? `/auth${next ? `?next=${encodeURIComponent(next)}` : ""}` : `/signup${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-extrabold text-brand-700 hover:underline">
          {mode === "signup" ? "Log in" : "Create account"}
        </Link>
      </p>
    </div>
  );
}
