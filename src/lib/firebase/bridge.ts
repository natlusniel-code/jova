import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { mintSession, requestClient } from "@/lib/auth/local";
import { postAuthDestination } from "@/lib/post-auth";
import { verifyFirebaseIdToken } from "@/lib/firebase/admin";
import { safeNextPath } from "@/lib/safe-next";
import {
  authFail,
  authOk,
  maskEmail,
  newCorrelationId,
} from "@/lib/auth/diagnostics";

type Role = "buyer" | "seller";

function safeAvatarUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Escape `%` and `_` so an email can never act as a LIKE wildcard. */
function likeLiteral(value: string) {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Every profile row that claims this email.
 *
 * ── Why this returns a LIST ──────────────────────────────────────────────────
 * The production database currently holds TWO `public.profiles` rows with the
 * same email (one `buyer`, one `seller` with a shop) — verified with
 * `select lower(email), count(*) from profiles group by 1 having count(*)>1`.
 *
 * The old code did `.limit(1).maybeSingle()` and took whichever row Postgres
 * happened to return. That is the second half of the redirect bug: the bridge
 * resolved profile A, then `mintSession(email)` asked Supabase for a magic link
 * and got auth user B, so the session's `auth.uid()` was B while the
 * destination was computed for A. The page then read a profile that did not
 * match the session, and the guards bounced the person back to `/auth`.
 *
 * Resolution is now explicit and deterministic — see `resolveCanonicalUser`.
 */
async function profilesForEmail(email: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id, role, created_at")
    .ilike("email", likeLiteral(email))
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error("We could not look up your Jova account. Please try again.");
  }
  return (data ?? []) as { id: string; role: string | null; created_at: string }[];
}

/**
 * Pick the ONE profile that owns this email, or create it.
 *
 * `preferredId` is the Supabase auth user id that Supabase itself resolved for
 * this email (from `generateLink`). When it is supplied it wins outright: the
 * session will carry that id, so the profile MUST be that id or the app and the
 * session disagree. This is what makes the duplicate-email case safe instead of
 * arbitrary.
 */
async function resolveCanonicalUser(input: {
  email: string;
  preferredId?: string;
  allowCreate: boolean;
  role: Role;
  identity: Awaited<ReturnType<typeof verifyFirebaseIdToken>>;
  cid: string;
}) {
  const { email, preferredId, allowCreate, role, identity, cid } = input;
  const rows = await profilesForEmail(email);

  if (preferredId) {
    const match = rows.find((r) => r.id === preferredId);
    if (match) {
      authOk("supabase.user.resolve", cid, {
        email: maskEmail(email),
        user_id: match.id,
        matched: "session_user",
        candidates: rows.length,
      });
      return { userId: match.id, created: false };
    }
  }

  if (rows.length === 1) {
    authOk("supabase.user.resolve", cid, {
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
    authFail("supabase.user.resolve", cid, {
      email: maskEmail(email),
      candidates: rows.length,
      reason: "duplicate_profiles",
    });
    throw new Error(
      "More than one Jova account uses this email address. Please contact support so we can merge them.",
    );
  }

  if (!allowCreate) {
    authSkipNoAccount(cid, email);
    return null;
  }

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: crypto.randomUUID() + crypto.randomUUID(),
    email_confirm: true,
    user_metadata: {
      full_name: identity.name ?? email.split("@")[0],
      auth_provider: "firebase",
      firebase_uid: identity.uid,
    },
  });

  if (error) {
    if (/already|exists|registered/i.test(error.message)) {
      // Raced with another request, or the auth user exists without a profile.
      const raced = await profilesForEmail(email);
      if (raced.length === 1) {
        authOk("supabase.user.resolve", cid, {
          email: maskEmail(email),
          user_id: raced[0].id,
          matched: "race_recovered",
        });
        return { userId: raced[0].id, created: false };
      }
    }
    authFail("supabase.user.resolve", cid, { email: maskEmail(email) }, error);
    throw new Error("We could not create your Jova account. Please try again.");
  }

  const avatar = safeAvatarUrl(identity.picture);
  const { error: profileError } = await admin
    .from("profiles")
    .update({
      full_name: identity.name ?? email.split("@")[0],
      role,
      ...(avatar ? { avatar_url: avatar } : {}),
    })
    .eq("id", data.user.id);

  if (profileError) {
    // The auth trigger creates the profile row. A later completion step can
    // fill optional fields, but a failed role write must not go unnoticed.
    authFail("supabase.user.resolve", cid, { email: maskEmail(email) }, profileError);
    throw new Error(
      "Your account was created, but its profile could not be prepared. Please contact support.",
    );
  }

  authOk("supabase.user.resolve", cid, {
    email: maskEmail(email),
    user_id: data.user.id,
    matched: "created",
  });
  return { userId: data.user.id, created: true };
}

function authSkipNoAccount(cid: string, email: string) {
  authOk("supabase.user.resolve", cid, {
    email: maskEmail(email),
    matched: "none",
    reason: "no_account",
  });
}

export type FirebaseBridgeResult =
  | { ok: true; next: string }
  | { ok: false; error: string; noAccount?: boolean };

export async function bridgeFirebaseSession(input: {
  idToken: string;
  mode: "signin" | "signup";
  role?: Role;
  next?: string | null;
}): Promise<FirebaseBridgeResult> {
  const cid = newCorrelationId();

  try {
    // ── 1. Firebase proves the identity ─────────────────────────────────────
    const identity = await verifyFirebaseIdToken(input.idToken);
    authOk("firebase.verify", cid, {
      email: maskEmail(identity.email),
      firebase_uid: identity.uid,
      mode: input.mode,
    });

    const role: Role = input.role === "seller" ? "seller" : "buyer";
    const next = safeNextPath(input.next);

    // ── 2. Resolve the Supabase user that owns this email ───────────────────
    // First pass: no session id yet, so this can only resolve an unambiguous
    // profile or create one. `mintSession` below returns the authoritative id
    // and we re-resolve against it.
    const first = await resolveCanonicalUser({
      email: identity.email,
      allowCreate: input.mode === "signup",
      role,
      identity,
      cid,
    });

    if (!first) {
      return {
        ok: false,
        noAccount: true,
        error: "There is no Jova account for this email. Please create an account first.",
      };
    }

    // ── 3. Mint the Supabase session and learn which auth user it belongs to ─
    const minted = await mintSession(identity.email, cid);

    // ── 4. Re-resolve against the session's own user id ─────────────────────
    // This is the step that makes the duplicate-email case correct: whatever
    // Supabase decided the email maps to is the id the app must use.
    const resolved = await resolveCanonicalUser({
      email: identity.email,
      preferredId: minted.userId,
      allowCreate: false,
      role,
      identity,
      cid,
    });

    if (!resolved) {
      authFail("supabase.user.resolve", cid, {
        email: maskEmail(identity.email),
        session_user_id: minted.userId,
        reason: "session_user_has_no_profile",
      });
      throw new Error(
        "Your Jova session was created but no account profile is attached to it. Please contact support.",
      );
    }

    // ── 5. Destination ──────────────────────────────────────────────────────
    if (resolved.created) {
      const destination =
        role === "seller" ? "/seller/onboarding?step=1" : "/signup/complete";
      authOk("redirect.destination", cid, { next: destination, reason: "new_account" });
      return { ok: true, next: destination };
    }

    const supabase = requestClient();
    const destination = await postAuthDestination(supabase, resolved.userId, next);
    authOk("redirect.destination", cid, {
      next: destination,
      user_id: resolved.userId,
      requested: next ?? null,
    });
    return { ok: true, next: destination };
  } catch (error) {
    authFail("firebase.verify", cid, { mode: input.mode }, error);
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "We could not complete your sign-in. Please try again.",
    };
  }
}
