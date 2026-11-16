"use client";

import { Client, Account, OAuthProvider } from "appwrite";
import {
  APP_URL,
  APPWRITE_ENDPOINT,
  APPWRITE_PROJECT_ID,
  APPWRITE_PROJECT_NAME,
  oauthOrigin,
} from "./config";

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

export { APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_PROJECT_NAME };

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
 * The result of the one-time startup connectivity check.
 *
 * `ok: false` is NOT fatal — the marketplace runs on Supabase and works fine
 * without Appwrite. It only means Google sign-in is unavailable, and the UI
 * says so instead of letting the button fail silently.
 */
export type AppwritePingResult =
  | { ok: true; endpoint: string; projectId: string; projectName: string }
  | { ok: false; endpoint: string; projectId: string; error: string };

let pingPromise: Promise<AppwritePingResult> | null = null;

/**
 * Confirm the Appwrite SDK is configured and the endpoint is reachable.
 *
 * ── Why this is memoised ────────────────────────────────────────────────────
 * `client.ping()` is a real network round-trip. The brief asks for it to run
 * once when the app starts, so the promise is cached: every caller after the
 * first shares the same result instead of re-pinging on each mount. A failed
 * ping is cached too — retrying on every render would hammer a down endpoint.
 *
 * ── Why it never throws ─────────────────────────────────────────────────────
 * A thrown error here would take down the auth screen for a problem that only
 * affects one optional sign-in method. It resolves to a result object instead,
 * so the caller decides what to show.
 */
export function pingAppwrite(): Promise<AppwritePingResult> {
  if (pingPromise) return pingPromise;

  pingPromise = (async (): Promise<AppwritePingResult> => {
    const base = {
      endpoint: APPWRITE_ENDPOINT,
      projectId: APPWRITE_PROJECT_ID,
    };

    try {
      const { client } = appwrite();
      // `ping()` hits GET /ping and resolves with the server's "Pong!".
      await client.ping();
      return { ok: true, ...base, projectName: APPWRITE_PROJECT_NAME };
    } catch (e) {
      return {
        ok: false,
        ...base,
        error:
          e instanceof Error
            ? e.message
            : "Could not reach the Appwrite endpoint.",
      };
    }
  })();

  return pingPromise;
}

/**
 * What the server should do when the Google identity comes back.
 *
 *   "signin" — the account must already exist. A Google address that has never
 *              signed up is refused, so the login page cannot be used to
 *              silently create accounts.
 *   "signup" — create the account if it does not exist, with `role` deciding
 *              where the person lands next.
 */
export type GoogleAuthMode = "signin" | "signup";

/**
 * Start the Google sign-in.
 *
 * `createOAuth2Token` NAVIGATES the browser to Google — it does not return a
 * promise that resolves with a token. So there is nothing to `await` and no
 * manual redirect afterwards; the `await` below is only there to surface a
 * synchronous throw (a misconfigured provider) as a rejected promise.
 *
 * ── Why mode and role ride in the success URL ─────────────────────────────
 * The browser leaves the app entirely and comes back with only what Appwrite
 * puts in the query string. There is no session, no React state and no
 * localStorage we can trust across the round trip, so the intent has to travel
 * in the URL. It is read back on `/auth/success` and handed to the server
 * action, which is where it is actually enforced — a tampered value can only
 * ask for a different landing page, never grant access to an account that does
 * not exist.
 */
export async function signInWithGoogle(
  opts: { mode?: GoogleAuthMode; role?: "buyer" | "seller"; next?: string } = {},
): Promise<void> {
  const { account } = appwrite();

  const mode: GoogleAuthMode = opts.mode === "signup" ? "signup" : "signin";
  const role = opts.role === "seller" ? "seller" : "buyer";

  const params = new URLSearchParams({ mode });
  if (mode === "signup") params.set("role", role);

  // A deep link the person was bounced from (a listing, a chat, checkout).
  // Only a same-origin relative path is carried, so this can never become an
  // open redirect; the server re-checks it before navigating.
  if (opts.next && opts.next.startsWith("/") && !opts.next.startsWith("//")) {
    params.set("next", opts.next);
  }

  // ── The redirect MUST be a registered Appwrite Web platform ───────────
  // This used to be `window.location.origin`, which made the OAuth start fail
  // with `Error 400 Invalid success param: Invalid URI` on every host that is
  // not registered on the project — which is every preview alias, and the
  // `njamart-...` (no "ai") address the bug was reported from. `oauthOrigin`
  // pins it to the canonical origin and keeps localhost for development.
  const origin = oauthOrigin(window.location.origin);

  const success = `${origin}/auth/success?${params.toString()}`;
  const failure = `${origin}/auth/failure`;

  await account.createOAuth2Token({
    provider: OAuthProvider.Google,
    success,
    failure,
  });
}

/** Read the intent back off the success URL. Defaults to a plain sign-in. */
export function readGoogleIntent(): {
  mode: GoogleAuthMode;
  role: "buyer" | "seller";
  next: string | null;
} {
  const url = new URL(window.location.href);
  const mode: GoogleAuthMode =
    url.searchParams.get("mode") === "signup" ? "signup" : "signin";
  const role = url.searchParams.get("role") === "seller" ? "seller" : "buyer";

  // Same-origin relative paths only — never an absolute URL.
  const raw = url.searchParams.get("next");
  const next = raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : null;

  return { mode, role, next };
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

/**
 * The signed-in Google account's profile picture URL, or null.
 *
 * ── Why this needs Google, not Appwrite ───────────────────────────────────
 * Appwrite does not expose the Google picture anywhere convenient: `prefs` is
 * `{}` for an OAuth2 user and the user model has no avatar field. The one
 * supported route is the session's `providerAccessToken` — the Google access
 * token Appwrite obtained during the OAuth exchange — used against Google's
 * userinfo endpoint, which returns `picture`.
 *
 * ── Why it never throws ───────────────────────────────────────────────────
 * An avatar is decoration. If Google is slow, the token has no `openid`/
 * `profile` scope, or the call fails, sign-in must still complete. Every
 * failure path returns null and the account keeps the default avatar.
 *
 * ── Why the URL is checked here as well as on the server ──────────────────
 * The value crosses into a server action and then into an `<img src>`. This
 * local check keeps an obviously wrong value (an empty string, a non-https
 * URL) from even making the round trip; the server re-validates the host,
 * because a browser can send anything.
 */
export async function fetchGoogleAvatarUrl(): Promise<string | null> {
  try {
    const { account } = appwrite();

    // `getSession("current")` returns the live session including the provider
    // tokens. A session created from a token (our flow) still carries them.
    const session = await account.getSession({ sessionId: "current" });
    const token = session?.providerAccessToken;
    if (!token) return null;

    const res = await fetch(
      `https://www.googleapis.com/oauth2/v3/userinfo?access_token=${encodeURIComponent(token)}`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;

    const profile = (await res.json()) as { picture?: unknown };
    const picture = profile?.picture;
    if (typeof picture !== "string" || !picture.startsWith("https://")) {
      return null;
    }
    return picture;
  } catch {
    return null;
  }
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
