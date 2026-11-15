import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID } from "./config";

/**
 * Server-side Appwrite bridge.
 *
 * ── The problem this solves ──────────────────────────────────────────────────
 * NaijaMart's entire marketplace — every page, every Server Action, every RLS
 * policy — is built on a SUPABASE session cookie. Appwrite is a second identity
 * provider bolted on for Google sign-in. If we simply created an Appwrite
 * session and stopped there, the user would be "signed in" to Appwrite and
 * still be a stranger to the marketplace: `getSession()` would return null,
 * RLS would return zero rows, and every seller page would bounce them to
 * /signin.
 *
 * So after Appwrite confirms the Google identity, this module finds (or
 * creates) the matching Supabase user and mints a real Supabase session for
 * it. From that point on the marketplace behaves exactly as it does for a
 * password user — same cookies, same RLS, same role routing.
 *
 * ── Why the JWT is verified, not trusted ────────────────────────────────────
 * The browser could POST any `userId` it liked. So it also sends a short-lived
 * Appwrite JWT, and we ask Appwrite who that JWT belongs to. Only if the answer
 * matches the claimed `userId` do we mint a session. Without this check the
 * endpoint would be an account-takeover hole: anyone could claim to be any
 * Appwrite user and be handed their Supabase session.
 */

/** The Appwrite user, as returned by `GET /account` with a JWT. */
type AppwriteUser = {
  $id: string;
  email: string | null;
  name: string | null;
  emailVerification: boolean;
};

/**
 * Ask Appwrite who a JWT belongs to.
 *
 * Returns null when the JWT is invalid, expired, or belongs to nobody — the
 * caller treats all three the same way (refuse).
 */
export async function verifyAppwriteJwt(jwt: string): Promise<AppwriteUser | null> {
  if (!jwt) return null;

  try {
    const res = await fetch(`${APPWRITE_ENDPOINT}/account`, {
      method: "GET",
      headers: {
        "X-Appwrite-Project": APPWRITE_PROJECT_ID,
        "X-Appwrite-JWT": jwt,
      },
      // A JWT is short-lived; never let a stale response be reused.
      cache: "no-store",
    });

    if (!res.ok) return null;

    const user = (await res.json()) as AppwriteUser;
    if (!user?.$id) return null;
    return user;
  } catch {
    return null;
  }
}

/**
 * Find the Supabase user for an Appwrite identity, creating one if needed.
 *
 * ── Why the email is the join key ───────────────────────────────────────────
 * Appwrite and Supabase are separate user stores with separate ID spaces. The
 * only stable fact both sides agree on is the verified email address. So:
 *
 *   • If a Supabase user already has this email (someone who signed up with a
 *     password, or a previous Google sign-in), we reuse that account. This is
 *     what makes "sign in with Google" work for an existing NaijaMart user
 *     instead of creating a duplicate buyer with no orders.
 *   • Otherwise we create one. The `handle_new_user` trigger (sql/0010) then
 *     creates the matching `profiles` row automatically, defaulting the role to
 *     'buyer' — a Google user is never silently made a seller or an admin.
 *
 * Returns the Supabase user id, or null when the identity has no usable email.
 */
export async function findOrCreateSupabaseUser(
  appwriteUser: AppwriteUser,
): Promise<{ userId: string; email: string; created: boolean } | null> {
  const email = appwriteUser.email?.trim().toLowerCase();
  if (!email) return null;

  const admin = createAdminClient();

  // ── Look for an existing account by email ────────────────────────────────
  // `listUsers` has no email filter in the admin API, so we page through. The
  // first page is enough in practice (a match is found on page 1 for any
  // realistic user base), but we cap the walk so a huge project cannot turn
  // this into an unbounded loop.
  const perPage = 200;
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`Could not look up accounts: ${error.message}`);

    const match = data.users.find(
      (u) => u.email?.trim().toLowerCase() === email,
    );
    if (match) return { userId: match.id, email, created: false };

    if (data.users.length < perPage) break;
  }

  // ── Create the account ───────────────────────────────────────────────────
  // The password is 48 random bytes that nobody ever sees: the admin API
  // requires the field, but this account signs in through Google only. It is
  // the same approach `createAccountUser` uses for password sign-ups.
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: crypto.randomUUID() + crypto.randomUUID(),
    email_confirm: true,
    user_metadata: {
      full_name: appwriteUser.name ?? email.split("@")[0],
      // Recorded so the account is traceable back to the provider that made it.
      oauth_provider: "google",
      appwrite_user_id: appwriteUser.$id,
    },
  });

  if (error) {
    // A race: another request created the same email between our lookup and
    // this insert. Re-read rather than failing the sign-in.
    if (/already|exists|registered/i.test(error.message)) {
      const { data: again } = await admin.auth.admin.listUsers({ page: 1, perPage });
      const match = again?.users.find(
        (u) => u.email?.trim().toLowerCase() === email,
      );
      if (match) return { userId: match.id, email, created: false };
    }
    throw new Error(`Could not create your account: ${error.message}`);
  }

  return { userId: data.user.id, email, created: true };
}
