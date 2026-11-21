"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useClerk, useSignIn, useSignUp } from "@clerk/nextjs";
import type { OAuthStrategy } from "@clerk/nextjs/types";
import { isClerkAPIResponseError } from "@clerk/nextjs/errors";
import { OAUTH_PROVIDERS, oauthOrigin, CLERK_CONFIGURED } from "@/lib/clerk/config";
import { bridgeClerkSession } from "@/app/auth/clerk-actions";
import { Alert, Spinner } from "@/components/ui";
import { cn } from "@/lib/utils";

type Mode = "signin" | "signup";
type Role = "buyer" | "seller";

/**
 * The Clerk auth panel — one component, two modes.
 *
 * ── Why one component ───────────────────────────────────────────────────────
 * Login and sign-up differ in exactly two things: whether a missing account is
 * created, and whether a role is chosen. Everything else — the provider
 * buttons, the email-code step, the error handling, the bridge call — is
 * identical. Splitting it into two files would duplicate the whole flow and let
 * the two drift apart.
 *
 * ── The four ways in ────────────────────────────────────────────────────────
 *   • Google, Apple, LinkedIn — OAuth redirect through Clerk.
 *   • Email — a one-time code, no password. Clerk mails the code; the person
 *     types it here and the session is created.
 *
 * ── Why the bridge call is here and not in the callback ─────────────────────
 * Clerk's session is not the marketplace's session. Every path — OAuth return
 * and email code alike — ends by calling `bridgeClerkSession`, which mints the
 * Supabase cookie the rest of the app reads. Keeping that in one place means
 * there is exactly one way a Jova session can start.
 */
/**
 * The auth panel, with a guard for an unconfigured environment.
 *
 * ── Why the split ───────────────────────────────────────────────────────────
 * `useSignIn` / `useSignUp` / `useClerk` THROW when there is no
 * `ClerkProvider` above them, and the provider is only mounted when a
 * publishable key exists (see `src/app/layout.tsx`). Without this wrapper a
 * host that has not been given the key yet would crash the auth pages instead
 * of explaining itself.
 *
 * The check is a build-time constant, so the branch never changes between
 * renders — the hooks below are still called unconditionally on every render
 * that reaches them, which is what the rules of hooks require.
 */
export function ClerkAuthPanel(props: {
  mode: Mode;
  next?: string;
  initialRole?: Role | null;
  noAccount?: boolean;
  existing?: boolean;
  clearStaleSession?: boolean;
  resumeFailed?: boolean;
}) {
  if (!CLERK_CONFIGURED) return <ClerkNotConfigured />;
  return <ClerkAuthPanelInner {...props} />;
}

/** Shown when the deployment has no Clerk publishable key. */
function ClerkNotConfigured() {
  return (
    <div>
      <h1 className="font-display text-[27px] font-extrabold tracking-[-0.035em] text-ink-900">
        Sign-in is not configured
      </h1>
      <p className="mt-2 text-[13.5px] leading-relaxed text-ink-500">
        This deployment has no Clerk publishable key, so accounts cannot be
        created or signed in to yet.
      </p>
      <div className="mt-5">
        <Alert tone="amber" title="One step for the site owner">
          Set <code className="font-mono text-[12px]">NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code>{" "}
          (and <code className="font-mono text-[12px]">CLERK_SECRET_KEY</code>) in
          the deployment environment, then redeploy. The keys are in the Clerk
          dashboard under API keys.
        </Alert>
      </div>
      <p className="mt-6 text-center text-[13px] text-ink-500">
        <Link href="/" className="font-bold text-brand-600 hover:underline">
          Back to the marketplace
        </Link>
      </p>
    </div>
  );
}

function ClerkAuthPanelInner({
  mode,
  next,
  initialRole = null,
  noAccount = false,
  existing = false,
  clearStaleSession = false,
  resumeFailed = false,
}: {
  mode: Mode;
  next?: string;
  initialRole?: Role | null;
  noAccount?: boolean;
  existing?: boolean;
  clearStaleSession?: boolean;
  resumeFailed?: boolean;
}) {
  const router = useRouter();
  // Clerk 7's hooks return a signal: `{ signIn, errors, fetchStatus }`. There is
  // no `isLoaded` any more — readiness is `fetchStatus === "idle"`, and the
  // resource object is always present. The resource is mutated in place by its
  // own methods, so reading `signIn.status` right after an `await` is the
  // documented way to branch on the outcome.
  const { signIn, fetchStatus: signInStatus } = useSignIn();
  const { signUp, fetchStatus: signUpStatus } = useSignUp();
  const { signOut } = useClerk();

  /**
   * Clear a stale Clerk session before starting a new sign-up.
   *
   * `/auth/resume` sends a person here with `fresh=1` when their Clerk identity
   * has no Jova account. Clerk still holds that session, and it will refuse to
   * start a sign-up while it is active — so it has to go first. Without this
   * the form would look fine and every button would fail.
   *
   * Runs once, on mount, and only in that case. `signOut()` clears the Clerk
   * cookie; the Supabase cookie is already absent (that is why we are here).
   */
  const cleared = useRef(false);
  // True while a stale Clerk session is being cleared.
  //
  // `signOut()` is asynchronous, and the form used to be usable the instant it
  // rendered. A provider button pressed before the sign-out resolved was
  // refused by Clerk with "You're already signed in" — the exact dead end this
  // page exists to remove, and the one in the bug report. So the form stays
  // disabled until the cleanup has actually finished.
  const [clearing, setClearing] = useState(clearStaleSession);
  useEffect(() => {
    if (!clearStaleSession || cleared.current) return;
    cleared.current = true;
    signOut()
      .catch(() => {
        // A failure here is not fatal: the sign-up attempt below will report
        // the real problem if the session is still active.
      })
      .finally(() => setClearing(false));
  }, [clearStaleSession, signOut]);

  const [role, setRole] = useState<Role | null>(initialRole);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  // How the person wants to prove the email: a password they set, or a
  // one-time code. Both are offered because they serve different people —
  // a returning user knows their password, while someone who signed up through
  // Appwrite (Google only, no password) has none and needs the code.
  const [method, setMethod] = useState<"password" | "code">("password");
  const [step, setStep] = useState<"email" | "code">("email");
  // Which Clerk resource issued the code. Verification must be attempted on the
  // same one that prepared it, and on the login page that is not always the
  // page's own mode — an existing Jova user with no Clerk identity starts a
  // sign-up, so their code belongs to `signUp`.
  const [codeFlow, setCodeFlow] = useState<"signin" | "signup">(
    mode === "signup" ? "signup" : "signin",
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const isSignup = mode === "signup";
  const ready = signInStatus === "idle" && signUpStatus === "idle" && !clearing;

  /** Turn a Clerk error into one readable sentence. */
  const readError = useCallback((e: unknown, fallback: string) => {
    // ── Never show Clerk's internal diagnostics ──────────────────────────────
    // Bot-protection failures arrive as messages written for a developer, e.g.
    // `Clerk: Protect check script execution failed: turnstile widget error
    // (code="protect_check_execution_failed")`. That is not something a shopper
    // can act on, and it reads like the site is broken. The cause is almost
    // always a browser extension, a strict privacy setting or a network that
    // blocks the challenge script, so say that instead.
    //
    // This is checked on the RAW message before anything else, because the
    // failure arrives as a plain `Error` (not a ClerkAPIResponseError) and so
    // never reached the branch below.
    const raw = e instanceof Error ? e.message : "";
    if (/turnstile|protect check|protect_check/i.test(raw)) {
      return "We could not verify this browser. Turn off any ad or privacy blocker for this site, then try again — or use a different sign-in method.";
    }
    if (/^Clerk:/i.test(raw)) {
      return fallback;
    }

    if (isClerkAPIResponseError(e)) {
      const first = e.errors?.[0];
      // Clerk's own rate limiter. Its raw text ("Too many requests") reads like
      // a bug in the site, so say what actually happened and what to do about
      // it. This is what the person saw after a run of failed attempts.
      if (first?.code === "rate_limit_exceeded") {
        return "Too many attempts in a short time. Wait a minute, then try again — or use a different sign-in method.";
      }
      // ── The password tab's three real dead ends ─────────────────────────────
      // Clerk answers `strategy_for_user_invalid` for an account that EXISTS but
      // has no password on it — every Appwrite/Google user, because they signed
      // up through OAuth. Its own longMessage is the developer string "Invalid
      // verification strategy", which reads like the site is broken. The person
      // can get in, just not with a password they never set, so say that.
      if (first?.code === "strategy_for_user_invalid") {
        return "That account has no password yet — it was created with Google, Apple or LinkedIn. Use “Email code” below, or sign in with that provider.";
      }
      // Signing up with an address that already has a Clerk identity. Usually an
      // OAuth user trying to add a password by registering again.
      if (first?.code === "form_identifier_exists") {
        return "An account already exists for that email. Log in instead — or, if you signed up with Google, use “Email code”.";
      }
      // Clerk enforces Have I Been Pwned on this instance.
      if (first?.code === "form_password_pwned") {
        return "That password appears in a known data breach. Choose a different one — longer is better.";
      }
      if (first?.code?.startsWith("protect_") || /turnstile|protect check/i.test(first?.message ?? "")) {
        return "We could not verify this browser. Turn off any ad or privacy blocker for this site, then try again — or use a different sign-in method.";
      }
      // Any other message that is really a developer diagnostic.
      if (/^Clerk:/i.test(first?.message ?? "")) {
        return fallback;
      }
      return first?.longMessage || first?.message || fallback;
    }
    return raw || fallback;
  }, []);

  /**
   * The machine-readable code on a Clerk error, e.g. `form_identifier_not_found`.
   *
   * Clerk 7 returns errors as values (`{ error }`) rather than throwing them, so
   * the code is read off the returned object. `isClerkAPIResponseError` covers
   * the API-shaped ones; the plain `code` fallback covers the rest.
   */
  const errorCode = useCallback((e: unknown): string => {
    if (isClerkAPIResponseError(e)) return e.errors?.[0]?.code ?? "";
    if (e && typeof e === "object" && "code" in e) {
      return String((e as { code?: unknown }).code ?? "");
    }
    return "";
  }, []);

  /**
   * Run a Clerk call with a deadline.
   *
   * ── Why this exists ──────────────────────────────────────────────────────────
   * A Clerk request that never settles leaves the button on "Creating your
   * account…" forever: the promise neither resolves nor rejects, so no `catch`
   * runs and no error is ever shown. That is the "stuck" report, and it is the
   * worst possible failure because the person cannot tell whether their account
   * was made.
   *
   * A hung request is indistinguishable from a slow one, so the only honest
   * move is to give up after a bounded wait and say so. The account may in fact
   * have been created — the message says that, and points at the way to check.
   */
  const withDeadline = useCallback(
    async <T,>(work: Promise<T>, ms = 20000): Promise<T> => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          work,
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () =>
                reject(
                  new Error(
                    "This is taking longer than expected. Check your connection and try again — if your account was created, use “Log in”.",
                  ),
                ),
              ms,
            );
          }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    },
    [],
  );

  /**
   * Finish: mint the Supabase session and navigate.
   *
   * Called after Clerk reports a complete session, from both the OAuth return
   * and the email-code step.
   */
  const finish = useCallback(
    async (opts: { mode: Mode; role?: Role | null }) => {
      // A Server Action can still reject (a network drop, a cold start, a
      // thrown error inside the bridge). Without this the button spun forever
      // with no message — the "stuck" report. Any failure becomes a visible
      // error on the form the person is looking at.
      let result: Awaited<ReturnType<typeof bridgeClerkSession>>;
      try {
        result = await bridgeClerkSession({
          mode: opts.mode,
          role: opts.role ?? "buyer",
          next: next ?? null,
        });
      } catch (e) {
        setBusy(null);
        setError(
          e instanceof Error
            ? e.message
            : "We could not finish your sign-in. Please try again.",
        );
        return;
      }

      if (!result.ok) {
        // A refusal belongs on the page the person was using, under the button
        // they pressed — not on a spinner screen with no context.
        const back = new URLSearchParams();
        if (result.noAccount) back.set("noaccount", "1");
        else if (result.existing) back.set("existing", "1");

        if (back.toString()) {
          const base = opts.mode === "signup" ? "/signup" : "/auth";
          router.replace(`${base}?${back.toString()}`);
          return;
        }

        setError(result.error);
        setBusy(null);
        return;
      }

      router.replace(result.next);
      router.refresh();
    },
    [next, router],
  );

  /** Start an OAuth round trip through Clerk. */
  async function handleOAuth(strategy: string, label: string) {
    if (!ready) return;
    setError("");
    setBusy(label);

    // The intent has to survive the round trip: the browser leaves the app
    // entirely and comes back with no React state. So mode, role and `next`
    // ride in the callback URL, and the server re-checks them.
    const params = new URLSearchParams({ mode });
    if (isSignup && role) params.set("role", role);
    if (next) params.set("next", next);

    const origin = oauthOrigin(window.location.origin);
    // Clerk 7 splits the two destinations apart:
    //   `redirectCallbackUrl` — where the provider returns (the handshake page);
    //   `redirectUrl`         — where a completed session lands.
    //
    // Both point at the SAME page now. The handshake page completes the OAuth
    // exchange AND mints the Jova session in one load, so there is no second
    // route to hand off to — that extra hop was the "Fetching your data"
    // screen. The intent rides on the URL because the handshake is a fresh page
    // load with no React state.
    const callbackUrl = `${origin}/auth/sso-callback?${params.toString()}`;
    const redirectCallbackUrl = callbackUrl;
    const redirectUrl = callbackUrl;

    try {
      // ── Why BOTH pages start a SIGN-IN ────────────────────────────────────
      // This is the Appwrite migration, and it is the one non-obvious line in
      // the whole flow.
      //
      // Every existing Jova user signed up through Appwrite. Their Google
      // identity lives in Appwrite's user store — Clerk has never seen them.
      //
      // Clerk handles that for us at the OAuth layer: when a `signIn` with an
      // OAuth strategy finds no Clerk account, it automatically TRANSFERS the
      // attempt to a `SignUp` and continues — the person still ends up with a
      // real Clerk session, and an existing Clerk account is signed in
      // normally. So one call covers both cases:
      //   • already a Clerk user → signed in;
      //   • Google identity new to Clerk (every Appwrite user) → Clerk creates
      //     their Clerk identity and signs them in.
      //
      // Starting a `signUp` here instead would be wrong: a sign-up for an
      // address Clerk already knows is rejected as a duplicate, which would
      // lock out users who signed in successfully yesterday.
      //
      // The "must already have a Jova account" rule is NOT enforced here — it
      // is enforced on the server, in `bridgeClerkSession`, which refuses a
      // LOGIN for an email that has no Supabase account. So the login page
      // still cannot create a Jova account; it can only prove an identity.
      const { error: ssoError } = await signIn.sso({
        strategy: strategy as OAuthStrategy,
        redirectUrl,
        redirectCallbackUrl,
      });

      if (ssoError) {
        setBusy(null);
        setError(readError(ssoError, `We could not reach ${label}. Please try again.`));
        return;
      }

      // A second factor (or device trust) means Clerk did NOT navigate. Say so
      // rather than leaving a spinner that will never resolve.
      if (
        signIn.status === "needs_second_factor" ||
        signIn.status === "needs_client_trust"
      ) {
        setBusy(null);
        setError(
          "Your account needs a second step. Use \u201cEmail me a code\u201d below to finish signing in.",
        );
        return;
      }
      // Otherwise the browser is navigating to the provider. Leave the spinner up.
    } catch (e) {
      setBusy(null);
      setError(readError(e, `We could not reach ${label}. Please try again.`));
    }
  }

  /** Sign in with email + password. */
  async function handlePasswordSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;

    const address = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setError("Enter a valid email address.");
      return;
    }
    if (password.length < 8) {
      setError("Your password is at least 8 characters.");
      return;
    }

    setError("");
    setBusy("password");

    try {
      // ── Why `signIn` and not `signUp` ─────────────────────────────────────
      // A password sign-in is only ever for an account that already has a
      // password. An Appwrite user has none — they signed up with Google — so
      // Clerk answers `form_password_incorrect` or `identifier_not_found`, and
      // the message below points them at the code option, which is the way in
      // for them. Creating an account here would be wrong: the login page must
      // not be able to create one.
      const { error: pwError } = await withDeadline(
        signIn.password({
          identifier: address,
          password,
        }),
      );

      if (pwError) {
        setBusy(null);
        setError(
          readError(
            pwError,
            "That email and password did not match. Check them, or use “Email me a code”.",
          ),
        );
        return;
      }

      if (signIn.status === "complete") {
        // `finalize()` is what actually sets the active session in Clerk 7 —
        // the old `setActive({ session: createdSessionId })` is gone.
        await signIn.finalize({ navigate: async () => {} });
        await finish({ mode, role });
        return;
      }

      // A second step is configured on the instance: either a real second
      // factor, or Device Trust challenging an unrecognised browser. Both mean
      // Clerk will not hand out a session from this password alone, so send the
      // person to the code step with an explanation instead of leaving the
      // button spinning.
      if (
        signIn.status === "needs_second_factor" ||
        signIn.status === "needs_client_trust"
      ) {
        setBusy(null);
        setError(
          "Your account needs one more step. Use “Email code” below to finish signing in.",
        );
        return;
      }

      setBusy(null);
      setError("We could not complete that sign-in. Please try again.");
    } catch (e) {
      setBusy(null);
      setError(
        readError(
          e,
          "That email and password did not match. Check them, or use “Email me a code”.",
        ),
      );
    }
  }

  /** Create an account with email + password. */
  async function handlePasswordSignUp(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;

    const address = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setError("Enter a valid email address.");
      return;
    }
    if (password.length < 8) {
      setError("Choose a password of at least 8 characters.");
      return;
    }

    setError("");
    setBusy("password");

    try {
      const { error: createError } = await withDeadline(
        signUp.create({
          emailAddress: address,
          password,
        }),
      );
      if (createError) throw createError;

      // Clerk emails a verification code for the new address. The account is
      // not usable until it is verified, so the code step is mandatory here —
      // it is not an optional second factor.
      const { error: sendError } = await withDeadline(
        signUp.verifications.sendEmailCode(),
      );
      if (sendError) throw sendError;

      setCodeFlow("signup");
      setStep("code");
      setBusy(null);
    } catch (e) {
      setBusy(null);
      setError(
        readError(
          e,
          "We could not create that account. Try a different email, or use “Email me a code”.",
        ),
      );
    }
  }

  /** Send the one-time code. */
  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;

    const address = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setError("Enter a valid email address.");
      return;
    }

    setError("");
    setBusy("email");

    try {
      // ── Two paths, chosen by what Clerk already knows ────────────────────
      // An existing Jova user has no Clerk identity yet — Clerk has never seen
      // them, because they signed up through Appwrite. So the flow cannot just
      // call `signIn`: for every one of those people Clerk would answer
      // "Couldn't find your account".
      //
      // So we read the intent from the PAGE:
      //
      //   sign-up page → create a Clerk identity, then email the code. This is
      //                  how an Appwrite user gets a Clerk account for the
      //                  first time: same email, new identity, and the bridge
      //                  then matches them to their existing Supabase account.
      //
      //   login page   → `signIn` first. An address Clerk knows gets a code
      //                  immediately (one step, no duplicate-account noise).
      //                  An address Clerk does NOT know throws
      //                  `form_identifier_not_found`, and we then create the
      //                  identity so the Appwrite users can still get in — with
      //                  a code, exactly like everyone else.
      //
      // In every branch the person ends up holding a one-time code, and which
      // Clerk resource issued it is remembered so verification targets the same
      // one.
      let startedAsSignUp = false;

      if (isSignup) {
        const { error: createError } = await withDeadline(
          signUp.create({ emailAddress: address }),
        );
        if (createError) throw createError;
        const { error: sendError } = await withDeadline(
          signUp.verifications.sendEmailCode(),
        );
        if (sendError) throw sendError;
        startedAsSignUp = true;
      } else {
        const { error: createError } = await withDeadline(
          signIn.create({ identifier: address }),
        );

        if (createError) {
          const code = errorCode(createError);
          const unknownIdentifier = /identifier_not_found|form_identifier/i.test(code);
          if (!unknownIdentifier) throw createError;

          // Not in Clerk yet — an existing Jova/Appwrite user. Create the
          // Clerk identity so they can verify this address and get in.
          const { error: suError } = await withDeadline(
            signUp.create({ emailAddress: address }),
          );
          if (suError) throw suError;
          const { error: sendError } = await withDeadline(
            signUp.verifications.sendEmailCode(),
          );
          if (sendError) throw sendError;
          startedAsSignUp = true;
        } else {
          // The address is known to Clerk. `sendCode()` with no arguments
          // targets the identifier the sign-in was just created with.
          const { error: sendError } = await withDeadline(
            signIn.emailCode.sendCode(),
          );
          if (sendError) throw sendError;
        }
      }

      // Remember which flow issued the code: verification has to be attempted
      // on the same resource that prepared it.
      setCodeFlow(startedAsSignUp ? "signup" : "signin");
      setStep("code");
      setBusy(null);
    } catch (e) {
      setBusy(null);
      setError(
        readError(
          e,
          isSignup
            ? "We could not send your code. Please try again."
            : "We could not send a code to that address. Check it and try again.",
        ),
      );
    }
  }

  /** Verify the code and finish. */
  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;

    const value = code.replace(/\s/g, "");
    if (value.length < 4) {
      setError("Enter the code from your email.");
      return;
    }

    setError("");
    setBusy("code");

    try {
      if (codeFlow === "signup") {
        const { error: verifyError } = await withDeadline(
          signUp.verifications.verifyEmailCode({ code: value }),
        );
        if (verifyError) throw verifyError;
        if (signUp.status !== "complete") {
          setBusy(null);
          setError("That code did not work. Check it and try again.");
          return;
        }
        await withDeadline(signUp.finalize({ navigate: async () => {} }));
      } else {
        const { error: verifyError } = await withDeadline(
          signIn.emailCode.verifyCode({ code: value }),
        );
        if (verifyError) throw verifyError;
        if (signIn.status !== "complete") {
          setBusy(null);
          setError("That code did not work. Check it and try again.");
          return;
        }
        await withDeadline(signIn.finalize({ navigate: async () => {} }));
      }

      await finish({ mode, role });
    } catch (e) {
      setBusy(null);
      setError(readError(e, "That code did not work. Check it and try again."));
    }
  }

  const roleChosen = !isSignup || role !== null;

  return (
    <div>
      {/* ── Heading ─────────────────────────────────────────────────────── */}
      <div className="mb-4">
        <h1 className="font-display text-[24px] font-extrabold leading-tight tracking-[-0.035em] text-ink-900">
          {isSignup ? "Create your account" : "Welcome back"}
        </h1>
        <p className="mt-1 text-[13px] leading-snug text-ink-500">
          {isSignup
            ? "Tell us what you're here for, then pick how you'd like to sign in."
            : "Sign in to get back to your profile, orders and chats."}
        </p>
      </div>

      {/* ── Refusals from the server ────────────────────────────────────── */}
      {noAccount && (
        <div className="mb-4 rounded-[16px] border border-[#f2d9a8] bg-[#fdf7ec] px-4 py-3">
          <p className="text-[13.5px] font-bold text-[#7a4f08]">
            You don&apos;t have an account yet
          </p>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-[#8a5a0b]">
            There is no Jova account for that email address. Create one first —
            it takes a minute.
          </p>
          <Link href="/signup" className="nm-btn-primary mt-3.5 w-full">
            Create an account
          </Link>
        </div>
      )}

      {existing && (
        <div className="mb-4 rounded-[16px] border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-[13.5px] font-bold text-amber-900">
            You already have an account
          </p>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-amber-800">
            That email is already registered with Jova. Log in instead to get
            back to your profile, orders and chats.
          </p>
          <Link href="/auth" className="nm-btn-primary mt-3.5 w-full">
            Log in
          </Link>
        </div>
      )}

      {resumeFailed && (
        <div className="mb-4 rounded-[16px] border border-[#f2d9a8] bg-[#fdf7ec] px-4 py-3">
          <p className="text-[13.5px] font-bold text-[#7a4f08]">
            We could not finish your last sign-in
          </p>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-[#8a5a0b]">
            Your previous session could not be completed. Sign in again below —
            it will start clean.
          </p>
        </div>
      )}

      {error && (
        <div className="mb-4">
          <Alert tone="red" title="Sign-in did not complete">
            {error}
          </Alert>
        </div>
      )}

      {/* ── Role choice (sign-up only) ──────────────────────────────────── */}
      {isSignup && (
        <>
          <p className="text-[11.5px] font-bold uppercase tracking-wider text-ink-500">
            What brings you here?
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {(
              [
                {
                  key: "buyer" as const,
                  emoji: "🛒",
                  title: "I'm here to buy",
                  body: "Shop goods or book a service from verified sellers near you.",
                },
                {
                  key: "seller" as const,
                  emoji: "🏪",
                  title: "I'm here to sell",
                  body: "Open a shop, list products or offer your skills.",
                },
              ] as const
            ).map((c) => {
              const active = role === c.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setRole(c.key)}
                  aria-pressed={active}
                  className={cn(
                    "relative rounded-2xl border-2 p-3 text-left transition",
                    active
                      ? "border-brand-500 bg-brand-50/70 shadow-card"
                      : "border-[var(--line)] bg-white hover:border-brand-300 hover:bg-brand-50/30",
                  )}
                >
                  <span
                    className={cn(
                      "grid h-7 w-7 place-items-center rounded-lg text-[15px] leading-none",
                      active ? "bg-brand-500" : "bg-slate-100",
                    )}
                    aria-hidden="true"
                  >
                    {c.emoji}
                  </span>
                  <p className="mt-1.5 text-[13px] font-bold leading-snug text-ink-900">
                    {c.title}
                  </p>
                  <p className="mt-0.5 text-[11.5px] leading-snug text-ink-500">
                    {c.body}
                  </p>
                  <span
                    className={cn(
                      "absolute right-3 top-3 grid place-items-center rounded-full border-2",
                      active
                        ? "border-brand-500 bg-brand-500 text-white"
                        : "border-slate-300",
                    )}
                    style={{ height: 18, width: 18 }}
                  >
                    {active && (
                      <svg
                        viewBox="0 0 24 24"
                        className="h-2.5 w-2.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={3.5}
                      >
                        <path d="m5 13 4 4L19 7" />
                      </svg>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* ── Providers ───────────────────────────────────────────────────── */}
      <div className={cn("space-y-2", isSignup ? "mt-4" : "mt-0")}>
        {OAUTH_PROVIDERS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => handleOAuth(p.strategy, p.label)}
            disabled={!ready || !roleChosen || busy !== null}
            aria-busy={busy === p.label}
            className={cn(
              "flex w-full items-center justify-center gap-2.5 rounded-[15px] border border-[var(--line)] bg-white px-4 py-2.5 text-[14px] font-semibold text-ink-900 transition",
              "hover:border-brand-300 hover:bg-brand-50/40 disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            <ProviderIcon provider={p.key} />
            <span>
              {busy === p.label
                ? `Taking you to ${p.label}…`
                : `Continue with ${p.label}`}
            </span>
            {busy === p.label && <Spinner className="ml-0.5" />}
          </button>
        ))}
      </div>

      {isSignup && !roleChosen && (
        <p className="mt-3 rounded-xl border border-dashed border-[var(--line)] bg-slate-50/60 px-4 py-2.5 text-center text-[12px] leading-relaxed text-ink-500">
          Choose buyer or seller above to continue.
        </p>
      )}

      <div className="mt-3">
        <Link
          href={isSignup ? `/auth/whatsapp?mode=signup${role ? `&role=${role}` : ""}` : "/auth/whatsapp?mode=login"}
          className="flex w-full items-center justify-center gap-2 rounded-[15px] border border-[#b9dfc8] bg-[#f0faf3] px-4 py-2.5 text-[13.5px] font-bold text-[#12643c] transition hover:bg-[#e4f5ea]"
        >
          <span aria-hidden="true">◉</span>
          Continue with WhatsApp
        </Link>
      </div>

      {/* ── Divider ─────────────────────────────────────────────────────── */}
      <div className="my-4 flex items-center gap-3">
        <span className="h-px flex-1 bg-[var(--line)]" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-400">
          or use email
        </span>
        <span className="h-px flex-1 bg-[var(--line)]" />
      </div>

      {/* ── Email: password or one-time code ────────────────────────────── */}
      {step === "email" ? (
        <div className="space-y-2.5">
          {/* The two ways to prove the address. A returning user with a
              password picks the first; an Appwrite/Google user with no
              password picks the second. */}
          <div
            role="tablist"
            aria-label="How to sign in with email"
            className="grid grid-cols-2 gap-1 rounded-[13px] border border-[var(--line)] bg-slate-50/70 p-1"
          >
            {(
              [
                { key: "password" as const, label: "Password" },
                { key: "code" as const, label: "Email code" },
              ] as const
            ).map((m) => (
              <button
                key={m.key}
                type="button"
                role="tab"
                aria-selected={method === m.key}
                onClick={() => {
                  setMethod(m.key);
                  setError("");
                }}
                disabled={busy !== null}
                className={cn(
                  "rounded-[10px] px-3 py-2 text-[12.5px] font-bold transition disabled:opacity-60",
                  method === m.key
                    ? "bg-white text-ink-900 shadow-sm"
                    : "text-ink-500 hover:text-ink-700",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>

          <form
            onSubmit={
              method === "password"
                ? isSignup
                  ? handlePasswordSignUp
                  : handlePasswordSignIn
                : handleSendCode
            }
            className="space-y-2.5"
          >
            <label className="block">
              <span className="mb-1 block text-[12px] font-semibold text-ink-700">
                Email address
              </span>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                disabled={busy !== null}
                className="w-full rounded-[13px] border border-[var(--line)] bg-white px-3.5 py-2.5 text-[14px] text-ink-900 outline-none transition placeholder:text-ink-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 disabled:opacity-60"
              />
            </label>

            {method === "password" && (
              <label className="block">
                <span className="mb-1 block text-[12px] font-semibold text-ink-700">
                  Password
                </span>
                <input
                  type="password"
                  autoComplete={isSignup ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={isSignup ? "At least 8 characters" : "Your password"}
                  disabled={busy !== null}
                  className="w-full rounded-[13px] border border-[var(--line)] bg-white px-3.5 py-2.5 text-[14px] text-ink-900 outline-none transition placeholder:text-ink-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 disabled:opacity-60"
                />
              </label>
            )}

            {/* Clerk renders its Turnstile challenge here for custom sign-up flows. */}
            <div id="clerk-captcha" />

            <button
              type="submit"
              disabled={!ready || !roleChosen || busy !== null}
              aria-busy={busy === "password" || busy === "email"}
              className="nm-btn-primary w-full py-2.5 text-[14.5px] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy === "password" || busy === "email" ? <Spinner /> : null}
              {method === "password"
                ? busy === "password"
                  ? isSignup
                    ? "Creating your account…"
                    : "Signing you in…"
                  : isSignup
                    ? "Create account with password"
                    : "Log in with password"
                : busy === "email"
                  ? "Sending your code…"
                  : "Email me a sign-in code"}
            </button>

            <p className="text-center text-[11px] leading-snug text-ink-400">
              {method === "password"
                ? isSignup
                  ? "We'll email a code to confirm the address before your account is active."
                  : "Signed up with Google before? Use “Email code” — there's no password on that account yet."
                : "We'll email you a one-time code. No password to remember."}
            </p>
          </form>
        </div>
      ) : (
        <form onSubmit={handleVerifyCode} className="space-y-3">
          <div className="rounded-[13px] border border-[var(--line)] bg-slate-50/70 px-3.5 py-2.5">
            <p className="text-[12.5px] leading-relaxed text-ink-600">
              We sent a code to{" "}
              <strong className="font-semibold text-ink-900">{email}</strong>.
            </p>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-[12.5px] font-semibold text-ink-700">
              Enter the code
            </span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
              maxLength={8}
              disabled={busy !== null}
              className="w-full rounded-[13px] border border-[var(--line)] bg-white px-3.5 py-3 text-center text-[20px] font-bold tracking-[0.3em] text-ink-900 outline-none transition placeholder:tracking-normal placeholder:text-ink-300 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 disabled:opacity-60"
            />
          </label>
          <button
            type="submit"
            disabled={!ready || busy !== null}
            aria-busy={busy === "code"}
            className="nm-btn-primary w-full py-3 text-[15px] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy === "code" ? <Spinner /> : null}
            {busy === "code" ? "Verifying…" : "Verify and continue"}
          </button>
          <button
            type="button"
            onClick={() => {
              setStep("email");
              setCode("");
              setError("");
            }}
            disabled={busy !== null}
            className="w-full text-center text-[12.5px] font-semibold text-brand-600 hover:underline disabled:opacity-50"
          >
            Use a different email
          </button>
        </form>
      )}

      {/* ── Door between the two pages ──────────────────────────────────── */}
      <p className="mt-4 text-center text-[13px] text-ink-500">
        {isSignup ? (
          <>
            Already have an account?{" "}
            <Link href="/auth" className="font-bold text-brand-600 hover:underline">
              Log in
            </Link>
          </>
        ) : (
          <>
            New to Jova?{" "}
            <Link href="/signup" className="font-bold text-brand-600 hover:underline">
              Create an account
            </Link>
          </>
        )}
      </p>

      <p className="mt-3 text-center text-[11px] leading-snug text-ink-400">
        By continuing you agree to our{" "}
        <Link href="/legal/terms" className="underline underline-offset-2 hover:text-ink-700">
          Terms
        </Link>{" "}
        and{" "}
        <Link href="/legal/refunds" className="underline underline-offset-2 hover:text-ink-700">
          Refund Policy
        </Link>
        .
      </p>
    </div>
  );
}

/** The provider marks, drawn inline so they need no image assets. */
function ProviderIcon({ provider }: { provider: string }) {
  if (provider === "google") {
    return (
      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
        <path
          fill="#EA4335"
          d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
        />
        <path
          fill="#4285F4"
          d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
        />
        <path
          fill="#FBBC05"
          d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
        />
        <path
          fill="#34A853"
          d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
        />
      </svg>
    );
  }

  if (provider === "apple") {
    return (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M16.36 12.78c.02 2.4 2.1 3.2 2.13 3.21-.02.05-.33 1.14-1.1 2.25-.66.96-1.35 1.92-2.44 1.94-1.07.02-1.41-.63-2.63-.63-1.22 0-1.6.61-2.61.65-1.05.04-1.85-1.04-2.52-2-1.37-1.98-2.42-5.6-1.01-8.04.7-1.21 1.95-1.98 3.3-2 1.03-.02 2 .69 2.63.69.63 0 1.81-.85 3.05-.73.52.02 1.98.21 2.92 1.58-.08.05-1.74 1.02-1.72 3.08M14.3 4.6c.56-.68.94-1.62.83-2.56-.81.03-1.79.54-2.37 1.22-.52.6-.97 1.56-.85 2.48.9.07 1.83-.46 2.39-1.14" />
      </svg>
    );
  }

  // LinkedIn
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="#0A66C2" aria-hidden="true">
      <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.47-.9 1.63-1.85 3.36-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z" />
    </svg>
  );
}
