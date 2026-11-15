"use client";

import { Client, Account, OAuthProvider } from "appwrite";
import { APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID } from "./config";

/**
 * Appwrite Web SDK — browser only.
 *
 * ── Why this file is `"use client"` ──────────────────────────────────────────
 * The Appwrite Web SDK keeps its session in `localStorage` and talks to the
 * Appwrite API directly from the browser. It must never be imported into a
 * Server Component or a Server Action: there is no `localStorage` there, and
 * the SDK would throw at import time. The server side of this integration lives
 * in `src/lib/appwrite/server.ts` and uses plain `fetch` instead.
 *
 * ── Why the token flow and not `createOAuth2Session` ─────────────────────────
 * `createOAuth2Session` relies on a cross-site cookie being set by Appwrite and
 * sent back on the redirect. Browsers now block third-party cookies by default,
 * so that flow silently fails on Safari and in Chrome's incognito mode. The
 * token flow avoids the problem entirely: Appwrite redirects back to OUR origin
 * with `userId` and `secret` in the query string, and the session is created
 * here, first-party, on our own domain.
 *
 * ── No secrets here ──────────────────────────────────────────────────────────
 * The project ID and endpoint are public by design (they identify the project,
 * they do not authorise anything). The Google OAuth client secret lives only in
 * the Appwrite Console and is never part of this bundle.
 */

export { APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID };

let cached: { client: Client; account: Account } | null = null;

/** The Appwrite client + account, created once per browser session. */
export function appwrite() {
  if (cached) return cached;

  const client = new Client()
    .setEndpoint(APPWRITE_ENDPOINT)
    .setProject(APPWRITE_PROJECT_ID);

  cached = { client, account: new Account(client) };
  return cached;
}

/**
 * Start the Google sign-in.
 *
 * `createOAuth2Token` NAVIGATES the browser to Google — it does not return a
 * promise that resolves with a token. So there is nothing to `await` and no
 * manual redirect afterwards; the `await` below is only there to surface a
 * synchronous throw (a misconfigured provider) as a rejected promise.
 */
export async function signInWithGoogle(): Promise<void> {
  const { account } = appwrite();

  const success = `${window.location.origin}/auth/success`;
  const failure = `${window.location.origin}/auth/failure`;

  await account.createOAuth2Token({
    provider: OAuthProvider.Google,
    success,
    failure,
  });
}

/**
 * Complete the sign-in on `/auth/success`.
 *
 * Returns the Appwrite session so the caller can hand the user id to the
 * server-side bridge. Throws a readable error when the query string is
 * incomplete — which happens when the user reloads `/auth/success` directly,
 * because the secret is single-use and already consumed.
 */
export async function completeOAuthSignIn(): Promise<{
  userId: string;
  secret: string;
}> {
  const url = new URL(window.location.href);
  const secret = url.searchParams.get("secret");
  const userId = url.searchParams.get("userId");

  if (!secret || !userId) {
    throw new Error(
      "This sign-in link is incomplete or has already been used. Start again from the sign-in page.",
    );
  }

  const { account } = appwrite();
  await account.createSession({ userId, secret });

  return { userId, secret };
}

/** The signed-in Appwrite user, or null when there is no session. */
export async function getAppwriteUser() {
  try {
    const { account } = appwrite();
    return await account.get();
  } catch {
    // A 401 here is the normal "not signed in" case, not an error worth
    // surfacing. Anything else (network down) also reads as "not signed in",
    // which sends the user to /auth — the safe direction.
    return null;
  }
}

/** A short-lived JWT the server can verify to trust this session. */
export async function createAppwriteJwt(): Promise<string> {
  const { account } = appwrite();
  const { jwt } = await account.createJWT();
  return jwt;
}

/** Sign out of Appwrite. Awaited by the caller before navigating. */
export async function signOutOfAppwrite(): Promise<void> {
  const { account } = appwrite();
  try {
    await account.deleteSession({ sessionId: "current" });
  } catch {
    // Already signed out, or the session expired. Either way the local state
    // is gone, which is what the caller wants.
  }
}
