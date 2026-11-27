import "server-only";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { mintSession, requestClient } from "@/lib/auth/local";
import { postAuthDestination } from "@/lib/post-auth";
import { safeNextPath } from "@/lib/safe-next";
import {
  authFail,
  authOk,
  maskEmail,
  newCorrelationId,
} from "@/lib/auth/diagnostics";

/**
 * Clerk -> Supabase session bridge.
 *
 * ── Why a bridge at all ──────────────────────────────────────────────────────
 * Clerk is now the identity provider: it owns the sign-in UI, the session
 * cookie, MFA, and the social connections. But every table in this project is
 * protected by RLS keyed on `auth.uid()`, and `auth.uid()` is a SUPABASE user
 * id. Clerk's `user_…` id means nothing to Postgres.
 *
 * So a Clerk sign-in is not finished when Clerk says it is. It is finished when
 * the person also holds a Supabase session whose `auth.uid()` is the id their
 * `profiles` row, `shops` row, orders and payouts already point at. That is
 * what this file does, and it is the ONLY place a session is established.
 *
 * ── The chain ────────────────────────────────────────────────────────────────
 *   1. Clerk proves the identity (`auth()` + `clerkClient().users.getUser`).
 *   2. Resolve the ONE Supabase user that owns this email, or create it.
 *   3. `mintSession(email)` — admin `generateLink` → `verifyOtp` — writes the
 *      `sb-…-auth-token` cookies.
 *   4. Re-resolve against the id the session actually carries, so the app and
 *      the session can never disagree.
 *   5. Compute the role-based destination.
 *
 * ── Why step 4 exists ────────────────────────────────────────────────────────
 * The production database has held two `profiles` rows with the same email (one
 * buyer, one seller with a shop). Picking "whichever row Postgres returned"
 * is how a seller lands inside a buyer's account. Whatever Supabase decided the
 * email maps to is the only answer that matches `auth.uid()`, so that id wins
 * outright and an ambiguous email with no session id is refused, not guessed.
 */

type Role = "buyer" | "seller";

/** Escape `%` and `_` so an email can never act as a LIKE wildcard. */
function likeLiteral(value: string) {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Only https avatars are stored; anything else is dropped rather than trusted. */
function safeAvatarUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Every profile row that claims this email. */
async function profilesForEmail(email: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id, role, created_at")
    .ilike("email", likeLiteral(email));

  if (error) throw error;
  return (data ?? []) as { id: string; role: string | null; created_at: string }[];
}

/**
 * Pick the ONE profile that owns this email, or create it.
 *
 * `preferredId` is the Supabase auth user id that Supabase itself resolved for
 * this email (from `generateLink`). When supplied it wins outright: the session
 * will carry that id, so the profile MUST be that id or the app and the session
 * disagree.
 */
async function resolveCanonicalUser(input: {
  email: string;
  preferredId?: string;
  allowCreate: boolean;
  role: Role;
  fullName?: string | null;
  avatarUrl?: string | null;
  clerkUserId: string;
  cid: string;
}): Promise<{ userId: string; created: boolean } | null> {
  const { email, preferredId, allowCreate, role, fullName, avatarUrl, clerkUserId, cid } = input;
  const rows = await profilesForEmail(email);

  if (preferredId) {
    const match = rows.find((r) => r.id === preferredId);
    if (match) {
      authOk("clerk.bridge", cid, {
        email: maskEmail(email),
        user_id: match.id,
        matched: "session_user",
        candidates: rows.length,
      });
      return { userId: match.id, created: false };
    }
  }

  if (rows.length === 1) {
    authOk("clerk.bridge", cid, {
      email: maskEmail(email),
      user_id: rows[0].id,
      matched: "single_profile",
      candidates: 1,
    });
    return { userId: rows[0].id, created: false };
  }

  if (rows.length > 1) {
    // Ambiguous and no session id to disambiguate with. Refuse rather than
    // silently pick a row: picking wrong is exactly how a seller lands in a
    // buyer's account (or vice versa).
    authFail("clerk.bridge", cid, {
      email: maskEmail(email),
      candidates: rows.length,
      reason: "duplicate_profiles",
    });
    throw new Error(
      "More than one Jova account uses this email address. Please contact support so we can merge them.",
    );
  }

  if (!allowCreate) {
    authOk("clerk.bridge", cid, {
      email: maskEmail(email),
      matched: "none",
      reason: "no_account",
    });
    return null;
  }

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    // Supabase requires a password to mint the auth user. It is random and
    // never shown to anyone: Clerk is the only way in, and `mintSession`
    // establishes the session with a one-time magic-link token, not this.
    password: crypto.randomUUID() + crypto.randomUUID(),
    email_confirm: true,
    user_metadata: {
      full_name: fullName ?? email.split("@")[0],
      auth_provider: "clerk",
      clerk_user_id: clerkUserId,
    },
  });

  if (error) {
    if (/already|exists|registered/i.test(error.message)) {
      // Raced with another request, or the auth user exists without a profile.
      const raced = await profilesForEmail(email);
      if (raced.length === 1) {
        authOk("clerk.bridge", cid, {
          email: maskEmail(email),
          user_id: raced[0].id,
          matched: "race_recovered",
        });
        return { userId: raced[0].id, created: false };
      }
    }
    authFail("clerk.bridge", cid, { email: maskEmail(email) }, error);
    throw new Error("We could not create your Jova account. Please try again.");
  }

  const avatar = safeAvatarUrl(avatarUrl);
  const { error: profileError } = await admin
    .from("profiles")
    .update({
      full_name: fullName ?? email.split("@")[0],
      role,
      ...(avatar ? { avatar_url: avatar } : {}),
    })
    .eq("id", data.user.id);

  if (profileError) {
    // The auth trigger creates the profile row. A later completion step can
    // fill optional fields, but a failed role write must not go unnoticed.
    authFail("clerk.bridge", cid, { email: maskEmail(email) }, profileError);
    throw new Error(
      "Your account was created, but its profile could not be prepared. Please contact support.",
    );
  }

  authOk("clerk.bridge", cid, {
    email: maskEmail(email),
    user_id: data.user.id,
    matched: "created",
  });
  return { userId: data.user.id, created: true };
}

export type ClerkBridgeResult =
  | { ok: true; next: string }
  | { ok: false; error: string; noAccount?: boolean };

/**
 * Turn the current Clerk session into a Supabase session.
 *
 * Must be called from a Server Action or Route Handler — `cookies()` is
 * read-only in a Server Component and the write would be silently dropped.
 */
export async function bridgeClerkSession(input: {
  mode: "signin" | "signup";
  role?: Role;
  next?: string | null;
}): Promise<ClerkBridgeResult> {
  const cid = newCorrelationId();

  try {
    // ── 1. Clerk proves the identity ────────────────────────────────────────
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      authFail("clerk.verify", cid, { reason: "no_clerk_session" });
      return {
        ok: false,
        error: "Your sign-in did not complete. Please try again.",
      };
    }

    const client = await clerkClient();
    const clerkUser = await client.users.getUser(clerkUserId);

    const email =
      clerkUser.primaryEmailAddress?.emailAddress ??
      clerkUser.emailAddresses[0]?.emailAddress ??
      null;

    if (!email) {
      authFail("clerk.verify", cid, {
        clerk_user_id: clerkUserId,
        reason: "no_email",
      });
      return {
        ok: false,
        error:
          "Your account has no email address attached. Add one in your account settings and try again.",
      };
    }

    const fullName =
      [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ").trim() ||
      clerkUser.username ||
      null;

    authOk("clerk.verify", cid, {
      email: maskEmail(email),
      clerk_user_id: clerkUserId,
      mode: input.mode,
    });

    const role: Role = input.role === "seller" ? "seller" : "buyer";
    const next = safeNextPath(input.next);

    // ── 2. Resolve the Supabase user that owns this email ───────────────────
    // First pass: no session id yet, so this can only resolve an unambiguous
    // profile or create one. `mintSession` below returns the authoritative id
    // and we re-resolve against it.
    const first = await resolveCanonicalUser({
      email,
      allowCreate: input.mode === "signup",
      role,
      fullName,
      avatarUrl: clerkUser.imageUrl,
      clerkUserId,
      cid,
    });

    if (!first) {
      return {
        ok: false,
        noAccount: true,
        error:
          "There is no Jova account for this email. Please create an account first.",
      };
    }

    // ── 3. Mint the Supabase session ────────────────────────────────────────
    const minted = await mintSession(email, cid);

    // ── 4. Re-resolve against the session's own user id ─────────────────────
    const resolved = await resolveCanonicalUser({
      email,
      preferredId: minted.userId,
      allowCreate: false,
      role,
      fullName,
      avatarUrl: clerkUser.imageUrl,
      clerkUserId,
      cid,
    });

    if (!resolved) {
      authFail("clerk.bridge", cid, {
        email: maskEmail(email),
        session_user_id: minted.userId,
        reason: "session_user_has_no_profile",
      });
      throw new Error(
        "Your Jova session was created but no account profile is attached to it. Please contact support.",
      );
    }

    // ── 5. Destination ──────────────────────────────────────────────────────
    if (resolved.created) {
      const dest =
        next ?? (role === "seller" ? "/seller/onboarding?step=1" : "/signup/complete");
      authOk("redirect.destination", cid, { destination: dest, created: true });
      return { ok: true, next: dest };
    }

    const dest = await postAuthDestination(
      requestClient(),
      resolved.userId,
      next,
    );

    authOk("redirect.destination", cid, { destination: dest });
    return { ok: true, next: dest };
  } catch (error) {
    authFail("clerk.bridge", cid, {}, error);
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "We could not finish signing you in. Please try again.",
    };
  }
}
