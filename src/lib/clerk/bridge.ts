import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Server-side Clerk → Supabase bridge.
 *
 * ── The problem this solves ──────────────────────────────────────────────────
 * Jova's entire marketplace — every page, every Server Action, every RLS
 * policy — is built on a SUPABASE session cookie. Clerk is now the identity
 * provider. If we simply signed the user in to Clerk and stopped there, they
 * would be "signed in" to Clerk and still a stranger to the marketplace:
 * `getSession()` would return null, RLS would return zero rows, and every
 * seller page would bounce them to /signin.
 *
 * So after Clerk confirms the identity, this module finds (or creates) the
 * matching Supabase user and mints a real Supabase session for it. From that
 * point on the marketplace behaves exactly as it always has — same cookies,
 * same RLS, same role routing.
 *
 * ── Why the email is the join key ────────────────────────────────────────────
 * Clerk and Supabase are separate user stores with separate ID spaces. The only
 * stable fact both sides agree on is the verified email address. So:
 *
 *   • If a Supabase user already has this email — someone who signed up with a
 *     password, or a Google user created by the OLD Appwrite flow — we reuse
 *     that account. This is what makes "sign in with Google" work for an
 *     existing Jova user instead of creating a duplicate buyer with no orders.
 *     It is also the whole Appwrite→Clerk migration story: the Appwrite Google
 *     users already have a Supabase row keyed on their Google email, so the
 *     first Clerk sign-in lands them back in their own account.
 *   • Otherwise we create one. The `handle_new_user` trigger (sql/0010) then
 *     creates the matching `profiles` row automatically, defaulting the role to
 *     'buyer' — a new user is never silently made a seller or an admin.
 */

/** The identity facts the bridge needs, taken from the verified Clerk session. */
export type ClerkIdentity = {
  /** Clerk's user id (`user_…`). Recorded for traceability, never used as a key. */
  clerkUserId: string;
  email: string | null;
  name: string | null;
  /** The Clerk profile image URL, if the provider supplied one. */
  imageUrl: string | null;
};

/**
 * Accept a profile-picture URL, or null.
 *
 * The value ends up in an `<img src>` on every page the person appears on, so a
 * `javascript:` or `data:` URL would be an XSS vector and an arbitrary remote
 * host would be a tracking pixel served under our pages. Only an https URL is
 * accepted; anything else is dropped and the account keeps its default avatar.
 */
export function safeAvatarUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;

  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Give an existing account the provider picture, but only if it has none.
 *
 * An EXISTING account may already have an avatar the person chose, and
 * overwriting it on every sign-in would quietly undo their choice. So this
 * reads the current value first and writes only when it is empty.
 *
 * Failures are swallowed: an avatar is decoration, and a cosmetic problem must
 * never turn into a failed login.
 */
async function backfillAvatar(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  avatar: string | null,
): Promise<void> {
  if (!avatar) return;

  try {
    const { data } = await admin
      .from("profiles")
      .select("avatar_url")
      .eq("id", userId)
      .maybeSingle();

    // Already has one — theirs wins.
    if (data?.avatar_url) return;

    await admin.from("profiles").update({ avatar_url: avatar }).eq("id", userId);
  } catch {
    // Cosmetic only. Never block a sign-in on it.
  }
}

/**
 * Find the Supabase user for a Clerk identity, creating one if needed.
 *
 * Returns the Supabase user id, or null when the identity has no usable email.
 */
export async function findOrCreateSupabaseUser(
  identity: ClerkIdentity,
  opts: {
    allowCreate?: boolean;
    role?: "buyer" | "seller";
  } = {},
): Promise<{ userId: string; email: string; created: boolean } | null> {
  const email = identity.email?.trim().toLowerCase();
  if (!email) return null;

  const allowCreate = opts.allowCreate === true;
  const admin = createAdminClient();

  // ── Look for an existing account by email ──────────────────────────────────
  // `listUsers` has no email filter in the admin API, so we page through. The
  // first page is enough in practice, but we cap the walk so a huge project
  // cannot turn this into an unbounded loop.
  const perPage = 200;
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`Could not look up accounts: ${error.message}`);

    const match = data.users.find(
      (u) => u.email?.trim().toLowerCase() === email,
    );
    if (match) {
      // An existing account keeps its own role. We do NOT overwrite it: someone
      // who is already a seller must not be demoted to buyer just because they
      // used the buyer signup page.
      await backfillAvatar(admin, match.id, safeAvatarUrl(identity.imageUrl));
      return { userId: match.id, email, created: false };
    }

    if (data.users.length < perPage) break;
  }

  // ── No account, and this flow does not allow creating one ──────────────────
  if (!allowCreate) {
    throw new NoAccountError(email);
  }

  // ── Create the account ─────────────────────────────────────────────────────
  // The password is 48 random bytes that nobody ever sees: the admin API
  // requires the field, but this account signs in through Clerk only.
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: crypto.randomUUID() + crypto.randomUUID(),
    email_confirm: true,
    user_metadata: {
      full_name: identity.name ?? email.split("@")[0],
      // Recorded so the account is traceable back to the provider that made it.
      auth_provider: "clerk",
      clerk_user_id: identity.clerkUserId,
      role: opts.role ?? "buyer",
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

  const userId = data.user.id;

  // ── Write the profile row ──────────────────────────────────────────────────
  // The trigger creates it with role 'buyer'. A seller signup needs the role
  // set now, because `postAuthDestination` reads `profiles.role` to decide
  // where to send them. The name and picture from the provider are copied in
  // too, so the profile is populated before the person ever sees a form.
  const avatar = safeAvatarUrl(identity.imageUrl);
  try {
    await admin
      .from("profiles")
      .update({
        full_name: identity.name ?? email.split("@")[0],
        role: opts.role ?? "buyer",
        ...(avatar ? { avatar_url: avatar } : {}),
      })
      .eq("id", userId);
  } catch {
    // The trigger may not have committed yet. The account still works; the
    // profile is filled in on the next step of the flow.
  }

  return { userId, email, created: true };
}

/**
 * Thrown when an identity has no Jova account and the flow does not allow
 * creating one. A distinct class so the action can turn it into a friendly,
 * specific message instead of a generic failure.
 */
export class NoAccountError extends Error {
  readonly email: string;
  constructor(email: string) {
    super(
      "There is no Jova account for that email address. Create an account first, then sign in.",
    );
    this.name = "NoAccountError";
    this.email = email;
  }
}
