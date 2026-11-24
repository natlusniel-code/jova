import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { mintSession, requestClient } from "@/lib/auth/local";
import { postAuthDestination } from "@/lib/post-auth";
import { verifyFirebaseIdToken } from "@/lib/firebase/admin";
import { safeNextPath } from "@/lib/safe-next";

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

async function findOrCreateFirebaseUser(
  identity: Awaited<ReturnType<typeof verifyFirebaseIdToken>>,
  allowCreate: boolean,
  role: Role,
) {
  const admin = createAdminClient();
  const { data: existing, error: lookupError } = await admin
    .from("profiles")
    .select("id")
    .ilike("email", identity.email)
    .limit(1)
    .maybeSingle();

  if (lookupError) {
    throw new Error("We could not look up your Jova account. Please try again.");
  }

  if (existing?.id) {
    return { userId: existing.id as string, email: identity.email, created: false };
  }

  if (!allowCreate) {
    return null;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: identity.email,
    password: crypto.randomUUID() + crypto.randomUUID(),
    email_confirm: true,
    user_metadata: {
      full_name: identity.name ?? identity.email.split("@")[0],
      auth_provider: "firebase",
      firebase_uid: identity.uid,
    },
  });

  if (error) {
    if (/already|exists|registered/i.test(error.message)) {
      const { data: raced } = await admin
        .from("profiles")
        .select("id")
        .ilike("email", identity.email)
        .limit(1)
        .maybeSingle();
      if (raced?.id) {
        return { userId: raced.id as string, email: identity.email, created: false };
      }
    }
    throw new Error("We could not create your Jova account. Please try again.");
  }

  const avatar = safeAvatarUrl(identity.picture);
  const { error: profileError } = await admin
    .from("profiles")
    .update({
      full_name: identity.name ?? identity.email.split("@")[0],
      role,
      ...(avatar ? { avatar_url: avatar } : {}),
    })
    .eq("id", data.user.id);

  if (profileError) {
    // Auth trigger creates the profile row. A later completion step can fill
    // optional profile fields, but a failed role write must not go unnoticed.
    throw new Error("Your account was created, but its profile could not be prepared. Please contact support.");
  }

  return { userId: data.user.id, email: identity.email, created: true };
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
  try {
    const identity = await verifyFirebaseIdToken(input.idToken);
    const role: Role = input.role === "seller" ? "seller" : "buyer";
    const next = safeNextPath(input.next);

    const resolved = await findOrCreateFirebaseUser(
      identity,
      input.mode === "signup",
      role,
    );

    if (!resolved) {
      return {
        ok: false,
        noAccount: true,
        error: "There is no Jova account for this email. Please create an account first.",
      };
    }

    await mintSession(resolved.email);

    if (resolved.created) {
      return {
        ok: true,
        next: role === "seller" ? "/seller/onboarding?step=1" : "/signup/complete",
      };
    }

    const supabase = requestClient();
    const destination = await postAuthDestination(
      supabase,
      resolved.userId,
      next,
    );
    return { ok: true, next: destination };
  } catch (error) {
    console.error("[firebase-bridge] sign-in failed:", error);
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "We could not complete your sign-in. Please try again.",
    };
  }
}
