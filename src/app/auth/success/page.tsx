"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { completeOAuthSignIn, createAppwriteJwt, fetchGoogleAvatarUrl, readGoogleIntent, signOutOfAppwrite } from "@/lib/appwrite/client";
import { bridgeGoogleSession } from "@/app/auth/google-actions";
import { Spinner, Alert } from "@/components/ui";

/**
 * `/auth/success` — the OAuth success callback.
 *
 * ── What happens here ──────────────────────────────────────────────
 *  1. Read `userId` + `secret` from the query string.
 *  2. `await account.createSession(...)` — this is the step that turns the
 *     one-time token into a real Appwrite session. It MUST be awaited before
 *     anything else touches the account.
 *  3. Ask Appwrite for a short-lived JWT and hand it to the server action,
 *     which verifies it and mints the matching Supabase session cookie.
 *  4. Navigate to the destination the server chose.
 *
 * ── Why the two refusals navigate instead of rendering here ─────────
 * "You do not have an account yet" and "that account already exists" belong on
 * the page the person was actually using — the message has to sit under the
 * button they pressed, next to the link that resolves it. So both are sent
 * back to their origin page as a query flag (`?noaccount=1`, `?existing=1`)
 * rather than drawn on this spinner screen, which has no context.
 *
 * ── Why the ref guard ──────────────────────────────────────────────
 * React 18 StrictMode mounts effects twice in development. The `secret` is
 * single-use, so a second `createSession` call would fail with a confusing
 * error after the first one already succeeded. The ref makes the exchange
 * happen exactly once per page load.
 *
 * ── Why the Appwrite session is deleted on failure ──────────────────
 * If the bridge fails, the user is signed in to Appwrite but not to the
 * marketplace — a half-signed-in state where every page bounces them back
 * here. Clearing the Appwrite session makes the retry clean.
 */
export default function AuthSuccessPage() {
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    (async () => {
      try {
        // 1 + 2 — exchange the token for an Appwrite session.
        const { userId } = await completeOAuthSignIn();

        // 3 — prove the session to the server and get a Supabase session.
        // The intent (sign in vs sign up, and which role) travelled here in
        // the query string; the server is what enforces it.
        const intent = readGoogleIntent();
        const jwt = await createAppwriteJwt();

        // The Google profile picture, read here because the Appwrite session
        // (and therefore the provider token) only exists in this browser. It
        // is null when Google shared no picture or the call failed — the
        // account then keeps the default avatar and sign-in is unaffected.
        const avatarUrl = await fetchGoogleAvatarUrl();

        const result = await bridgeGoogleSession({
          userId,
          jwt,
          mode: intent.mode,
          role: intent.role,
          next: intent.next,
          avatarUrl,
        });

        if (!result.ok) {
          await signOutOfAppwrite();

          // Send the refusal back to the page that caused it, so the message
          // and the link that fixes it appear together.
          const back = new URLSearchParams();
          if (result.noAccount) back.set("noaccount", "1");
          else if (result.existing) back.set("existing", "1");

          if (back.toString()) {
            const base = intent.mode === "signup" ? "/signup" : "/auth";
            router.replace(`${base}?${back.toString()}`);
            return;
          }

          setError(result.error);
          return;
        }

        // 4 — the server decided where this account belongs.
        router.replace(result.next);
      } catch (e) {
        await signOutOfAppwrite();
        setError(
          e instanceof Error
            ? e.message
            : "We could not complete your sign-in. Please try again.",
        );
      }
    })();
  }, [router]);

  if (error) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col justify-center px-4">
        <div className="nm-card p-6">
          <h1 className="text-[20px] font-extrabold tracking-tight text-ink-900">
            Sign-in did not complete
          </h1>
          <div className="mt-3">
            <Alert tone="red">{error}</Alert>
          </div>
          <div className="mt-5 space-y-2.5">
            <Link href="/auth" className="nm-btn-primary w-full py-3">
              Try again
            </Link>
            <Link href="/" className="nm-btn-ghost w-full py-3">
              Back to the marketplace
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col items-center justify-center px-4">
      <div className="nm-card flex w-full flex-col items-center gap-3 p-8">
        <Spinner className="h-6 w-6 text-brand-500" />
        <p className="text-[15px] font-semibold text-ink-900">Signing you in…</p>
        <p className="text-center text-[13px] leading-relaxed text-ink-500">
          Finishing your Google sign-in. This takes a moment.
        </p>
      </div>
    </div>
  );
}
