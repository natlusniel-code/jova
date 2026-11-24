import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/config";

type CookieToSet = {
  name: string;
  value: string;
  options?: Record<string, unknown>;
};

/**
 * Jova's session plumbing — server side.
 *
 * ── What this file is now ───────────────────────────────────────────────────
 * Google is the only way into the marketplace, so there is no password store
 * to read and no account to create here. What remains is the machinery that
 * turns a verified identity into a Supabase session, because every table in
 * this project is protected by RLS keyed on `auth.uid()`:
 *
 *   • `mintSession`   — give an already-verified user a real Supabase session;
 *   • `requestClient` — the SSR client bound to the current request's cookies;
 *   • `checkPassword` — used ONLY by the separate admin console login, which
 *                       is not part of the public sign-in surface.
 *
 * ── What was removed ────────────────────────────────────────────────────────
 * `createAccountUser`, `setPassword`, `emailTaken`, `phoneMatches`,
 * `accountHasPhone`, `issueCode` and `verifyCode` all served the email +
 * password signup, the email verification code, and the phone-based password
 * reset. All three flows are gone, so those functions are gone with them
 * rather than left as dead code that still looks callable.
 *
 * ── Why minting needs no password ───────────────────────────────────────────
 * `admin.generateLink({ type: "magiclink" })` returns a one-time
 * `hashed_token` for an existing user. `verifyOtp({ token_hash })` exchanges it
 * for a session and writes the auth cookies. The token is single-use and
 * expires in minutes, and it is only ever created on the server, after the
 * identity has already been proven — by Google, or by the admin console's own
 * password check. It is not a way in; it is the last step of a sign-in that
 * already succeeded.
 */

export type LoginVerdict =
  | { ok: true; userId: string; email: string; role: string }
  | { ok: false; error: "invalid" | "locked" | "banned" | "no_credentials"; retryAfter?: number };

/**
 * Ask the database whether this email + password pair is correct.
 *
 * Only the admin console uses this now. The public sign-in is Google-only, so
 * this is never reachable from the marketplace's own auth pages.
 */
export async function checkPassword(email: string, password: string): Promise<LoginVerdict> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("nm_login", {
    p_email: email,
    p_password: password,
  });

  if (error) {
    // A missing function means sql/0015 has not been applied to this project.
    // Say so plainly instead of pretending the password was wrong.
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
 * Give this user a Supabase session, writing the auth cookies.
 *
 * Must be called from a Server Action or Route Handler — `cookies()` is
 * read-only in a Server Component, and the write would be silently dropped.
 */
export async function mintSession(email: string): Promise<void> {
  const admin = createAdminClient();

  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (error) throw new Error(`Could not start a session: ${error.message}`);

  // The shape differs between supabase-js versions: the token sits either at
  // the top level or under `properties`.
  const hashed =
    (data as { hashed_token?: string })?.hashed_token ??
    (data as { properties?: { hashed_token?: string } })?.properties?.hashed_token;

  if (!hashed) throw new Error("Could not start a session: no token was issued.");

  // Resolve the mutable Next.js cookie store once, then expose the
  // synchronous getAll/setAll adapter expected by @supabase/ssr 0.5.x.
  // This Server Action must write the cookies onto its outgoing response.
  const cookieStore = await cookies();
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      },
    },
  });

  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: hashed,
  });
  if (verifyError) throw new Error(`Could not start a session: ${verifyError.message}`);

  // Fail inside the action if Supabase did not establish a readable session;
  // never send the browser to a destination that will immediately bounce to
  // /auth again.
  const { data: sessionData, error: sessionError } = await supabase.auth.getUser();
  if (sessionError || !sessionData.user) {
    throw new Error("Supabase did not establish your Jova session. Please try again.");
  }
  if (sessionData.user.email?.toLowerCase() !== email.trim().toLowerCase()) {
    throw new Error("The Jova session belongs to a different email address. Please sign in again.");
  }
}

/** The SSR client bound to the current request's cookies. */
export function requestClient() {
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      async getAll() {
        return (await cookies()).getAll();
      },
      async setAll(cookiesToSet: CookieToSet[]) {
        try {
          const cookieStore = await cookies();
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Component: read-only. The middleware refreshes instead.
        }
      },
    },
  });
}
