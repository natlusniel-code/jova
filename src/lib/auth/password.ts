import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { mintSession } from "@/lib/auth/local";
import {
  authFail,
  authOk,
  maskEmail,
  newCorrelationId,
} from "@/lib/auth/diagnostics";
import { postAuthDestination } from "@/lib/post-auth";
import { safeNextPath } from "@/lib/safe-next";
import { requestClient } from "@/lib/auth/local";

/**
 * Plain email + password authentication, against the Jova credential store.
 *
 * ── Why the password is NOT checked by Supabase's own sign-in ───────────────
 * This is the important detail, and it is measured, not assumed.
 *
 * Jova's accounts were created by the local-credentials flow (sql/0015). That
 * flow stores the bcrypt hash in `public.account_credentials` and checks it
 * with `nm_login()`. `auth.users.encrypted_password` holds a DIFFERENT hash —
 * a random value Supabase generated when the account was minted, which the
 * user has never known.
 *
 * Verified against the live project with the real test account
 * (sultananifowose@gmail.com):
 *
 *   bcrypt.compare('adeyinka12$', auth.users.encrypted_password)      -> false
 *   bcrypt.compare('adeyinka12$', account_credentials.password_hash)  -> true
 *
 * So `supabase.auth.signInWithPassword()` returns `invalid_credentials` for a
 * password the user definitely has. That is not a bug in this branch — it is
 * the reason the branch must check the credential table, exactly as the
 * original email/password implementation did.
 *
 * ── The two steps ───────────────────────────────────────────────────────────
 *   1. `nm_login(email, password)` — the database verifies the bcrypt hash,
 *      enforces the lockout counter, and returns the user id + role. It is
 *      EXECUTE-revoked from anon/authenticated, so it can only be called with
 *      the service-role key, server-side. It is not a password oracle.
 *   2. `mintSession(email)` — turns that verified identity into a real
 *      Supabase session (admin generateLink -> verifyOtp), writing the auth
 *      cookies. Every RLS policy and every existing query keeps working,
 *      because the session belongs to the SAME user id the profile, shops,
 *      orders and roles already point at.
 *
 * No user is created, no password is written, and no row is migrated on the
 * sign-in path.
 */

export type PasswordAuthResult =
  | { ok: true; next: string }
  | { ok: false; error: string; field?: "email" | "password" | "form" };

type LoginVerdict =
  | { ok: true; userId: string; email: string; role: string }
  | { ok: false; error: "invalid" | "locked" | "banned" | "no_credentials"; retryAfter?: number };

/** Ask the database whether this email + password pair is correct. */
async function checkPassword(email: string, password: string): Promise<LoginVerdict> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("nm_login", {
    p_email: email,
    p_password: password,
  });

  if (error) {
    if (/could not find the function|does not exist/i.test(error.message)) {
      throw new Error(
        "Sign-in is not set up on this database yet — run sql/0015_local_auth.sql in the Supabase SQL editor.",
      );
    }
    throw new Error(error.message);
  }

  const v = data as {
    ok: boolean;
    error?: string;
    user_id?: string;
    email?: string;
    role?: string;
    retry_after_seconds?: number;
  };

  if (v.ok) {
    return { ok: true, userId: v.user_id!, email: v.email!, role: v.role ?? "buyer" };
  }

  const reason = (v.error ?? "invalid") as "invalid" | "locked" | "banned" | "no_credentials";
  return { ok: false, error: reason, retryAfter: v.retry_after_seconds };
}

/**
 * Sign in with an email and password that already exist in Jova.
 *
 * Returns the destination to navigate to, or a real error. Never redirects
 * from inside the action — the caller decides, so a failure can be shown on
 * the form instead of silently bouncing the user back to /auth.
 */
export async function signInWithPassword(
  email: string,
  password: string,
  requestedNext?: string | null,
): Promise<PasswordAuthResult> {
  const cid = newCorrelationId();
  const cleanEmail = email.trim().toLowerCase();

  if (!cleanEmail || !password) {
    return { ok: false, error: "Enter your email address and password.", field: "form" };
  }

  // ── Step 1: verify the password against the credential store ─────────────
  let verdict: LoginVerdict;
  try {
    verdict = await checkPassword(cleanEmail, password);
  } catch (e) {
    authFail("supabase.user.resolve", cid, { email: maskEmail(cleanEmail) }, e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : "We couldn't check your password just now.",
      field: "form",
    };
  }

  if (!verdict.ok) {
    authFail("supabase.user.resolve", cid, {
      email: maskEmail(cleanEmail),
      reason: verdict.error,
    });

    if (verdict.error === "invalid") {
      return {
        ok: false,
        error: "That email and password don't match. Check the password and try again.",
        field: "password",
      };
    }
    if (verdict.error === "locked") {
      const mins = Math.max(1, Math.ceil((verdict.retryAfter ?? 60) / 60));
      return {
        ok: false,
        error: `Too many wrong attempts. Try again in about ${mins} minute${mins === 1 ? "" : "s"}.`,
        field: "form",
      };
    }
    if (verdict.error === "banned") {
      return {
        ok: false,
        error: "This account has been suspended. Contact support if you think that is a mistake.",
        field: "form",
      };
    }
    // no_credentials: the email is unknown, or the account predates the
    // credential table. Say the same thing either way — never reveal which
    // addresses exist.
    return {
      ok: false,
      error: "That email and password don't match. Check the password and try again.",
      field: "password",
    };
  }

  authOk("supabase.user.resolve", cid, {
    email: maskEmail(cleanEmail),
    user_id: verdict.userId,
    role: verdict.role,
  });

  // ── Step 2: turn the verified identity into a Supabase session ───────────
  let sessionUserId: string;
  try {
    const minted = await mintSession(cleanEmail, cid);
    sessionUserId = minted.userId;
  } catch (e) {
    authFail("supabase.session.mint", cid, { email: maskEmail(cleanEmail) }, e);
    return {
      ok: false,
      error:
        e instanceof Error
          ? e.message
          : "We verified your password but could not start your session. Please try again.",
      field: "form",
    };
  }

  // The session must belong to the account whose password we just checked.
  // If it does not, something is wrong with the account mapping and signing
  // in would put the user inside someone else's data.
  if (sessionUserId !== verdict.userId) {
    authFail("supabase.session.verify", cid, {
      email: maskEmail(cleanEmail),
      expected_user_id: verdict.userId,
      session_user_id: sessionUserId,
      reason: "user_id_mismatch",
    });
    return {
      ok: false,
      error:
        "We could not match your session to your account. Please try again — if it keeps happening, tell support.",
      field: "form",
    };
  }

  authOk("supabase.session.verify", cid, {
    email: maskEmail(cleanEmail),
    user_id: sessionUserId,
  });

  const dest = await postAuthDestination(
    requestClient(),
    sessionUserId,
    safeNextPath(requestedNext),
  );

  authOk("redirect.destination", cid, { destination: dest });
  return { ok: true, next: dest };
}

export type SignUpInput = {
  email: string;
  password: string;
  fullName: string;
  role: "buyer" | "seller";
  next?: string | null;
};

/**
 * Create an account with an email and password, then sign it in immediately.
 *
 * ── No email verification ───────────────────────────────────────────────────
 * The account is created with `email_confirm: true`, so there is no
 * confirmation link, no code, and no "check your inbox" dead end.
 *
 * ── No duplicate accounts ───────────────────────────────────────────────────
 * `createUser` fails with an "already registered" error when the address
 * exists, and that is surfaced as a plain "sign in instead" message. It never
 * creates a second row for an existing email, so profiles, roles, shops,
 * orders and RLS keep pointing at the same user id.
 *
 * ── Both stores are written ─────────────────────────────────────────────────
 * The account needs a row in `auth.users` (so it has an id and a session) AND
 * a row in `account_credentials` (so `nm_login` can verify its password next
 * time). Writing only the first is exactly the state that made the test
 * account's password unverifiable, so both are written here, in that order,
 * and a failure to write the credential row is reported rather than ignored.
 */
export async function signUpWithPassword(input: SignUpInput): Promise<PasswordAuthResult> {
  const cid = newCorrelationId();
  const cleanEmail = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim();
  const role: "buyer" | "seller" = input.role === "seller" ? "seller" : "buyer";

  if (!cleanEmail) {
    return { ok: false, error: "Enter your email address.", field: "email" };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return { ok: false, error: "Enter a valid email address.", field: "email" };
  }
  if (input.password.length < 8) {
    return { ok: false, error: "Use at least 8 characters for your password.", field: "password" };
  }
  if (fullName.length < 3) {
    return { ok: false, error: "Enter your full name.", field: "form" };
  }

  const admin = createAdminClient();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: cleanEmail,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: fullName, role },
  });

  if (createError) {
    const m = createError.message.toLowerCase();
    if (m.includes("already") || m.includes("exists") || m.includes("registered")) {
      authFail("supabase.user.resolve", cid, {
        email: maskEmail(cleanEmail),
        reason: "email_taken",
      });
      return {
        ok: false,
        error: "That email is already registered. Sign in instead.",
        field: "email",
      };
    }
    authFail("supabase.user.resolve", cid, { email: maskEmail(cleanEmail) }, createError);
    return { ok: false, error: createError.message, field: "form" };
  }

  const userId = created.user?.id;
  if (!userId) {
    return { ok: false, error: "We could not create your account. Please try again.", field: "form" };
  }

  authOk("supabase.user.resolve", cid, {
    email: maskEmail(cleanEmail),
    user_id: userId,
    created: true,
  });

  // Write the credential row so `nm_login` can verify this password next time.
  // `nm_set_password` hashes with pgcrypto and is service-role only.
  const { error: credError } = await admin.rpc("nm_set_password", {
    p_user_id: userId,
    p_email: cleanEmail,
    p_password: input.password,
  });

  if (credError) {
    authFail("supabase.user.resolve", cid, {
      email: maskEmail(cleanEmail),
      user_id: userId,
      reason: "credential_write_failed",
    }, credError);
    return {
      ok: false,
      error:
        "Your account was created but its password could not be saved. Please contact support so we can finish setting it up.",
      field: "form",
    };
  }

  // Sign in through the same path a returning user takes, so there is exactly
  // one way a session gets established.
  let sessionUserId: string;
  try {
    const minted = await mintSession(cleanEmail, cid);
    sessionUserId = minted.userId;
  } catch (e) {
    authFail("supabase.session.mint", cid, { email: maskEmail(cleanEmail) }, e);
    return {
      ok: false,
      error:
        "Your account was created, but we could not sign you in. Go to the sign-in page and use the password you just chose.",
      field: "form",
    };
  }

  authOk("supabase.session.verify", cid, {
    email: maskEmail(cleanEmail),
    user_id: sessionUserId,
  });

  // A buyer still needs a phone number and an LGA before the storefront is
  // usable for them; a seller starts onboarding. An explicit `next` wins.
  const explicit = safeNextPath(input.next);
  const dest =
    explicit ??
    (role === "seller" ? "/seller/onboarding?step=1" : "/signup/complete");

  authOk("redirect.destination", cid, { destination: dest, role });
  return { ok: true, next: dest };
}
