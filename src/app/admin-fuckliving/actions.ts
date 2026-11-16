"use server";

/**
 * All admin mutations live here.
 *
 * They run on the server with the service-role client, so the browser never
 * holds a privileged key. Each action returns a plain `{ ok, error }` result
 * instead of throwing, because the calling components render the message inline.
 *
 * ── Why every action opens with `requireAdmin()` ───────────────────────────
 * The console's pages are gated by middleware, but a Server Action is its own
 * HTTP endpoint: it can be invoked directly, without ever rendering the page
 * that contains the button. Gating only the page protects the view and not the
 * mutation — and these mutations verify payments, release payouts, ban buyers
 * and change platform settings. So each action re-checks the `admin_users` row
 * itself, through the same helper the middleware uses.
 *
 * ── The database is the single source of truth for the rules ───────────────
 * This file used to re-implement, in TypeScript, the business rules of
 * `admin_verify_payment`, `admin_resolve_dispute`, `admin_mark_payout_paid`,
 * `admin_set_shop_status`, `admin_save_payment_account` and
 * `admin_delete_payment_account` — because those RPCs open with
 * `if not public.is_admin()` and a Server Action has no `auth.uid()`.
 *
 * Two copies of the same rules drift, and they had: the TS copy of
 * `admin_resolve_dispute` hardcoded a one-day payout hold while SQL used
 * `payout_hold_days`, and the TS copy of `admin_verify_payment` cancelled the
 * order and notified the buyer on rejection while SQL only restored stock.
 *
 * `sql/0043_admin_rpc_single_source_of_truth.sql` fixes the guard instead:
 * `is_admin()` now also accepts a caller authenticated as `service_role`
 * (which a browser cannot forge — PostgREST reads the role from the verified
 * JWT). So every action below simply calls the RPC. The rules live in one
 * place, and a change to them is a migration, not a code change in two files.
 *
 * `p_actor` is passed for the audit columns only (`verified_by`,
 * `resolved_by`). It is never used for authorisation.
 */
import { revalidatePath } from "next/cache";
import { createAdminClient, hasAdminKey } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin-guard";

export type ActionResult = { ok: boolean; error?: string };

const NO_KEY =
  "SUPABASE_SERVICE_ROLE_KEY is not set on the server, so admin writes are disabled. See README §1d.";

function fail(error: unknown): ActionResult {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : (error as { message?: string })?.message ?? "Something went wrong.";
  return { ok: false, error: message };
}

/** Revalidate every admin surface after a write. */
function refreshAdmin(extra?: string[]) {
  for (const p of [
    "/admin-fuckliving",
    "/admin-fuckliving/orders",
    "/admin-fuckliving/payments",
    "/admin-fuckliving/payouts",
    "/admin-fuckliving/disputes",
    "/admin-fuckliving/sellers",
    "/admin-fuckliving/buyers",
    "/admin-fuckliving/reviews",
    "/admin-fuckliving/settings",
    ...(extra ?? []),
  ]) {
    revalidatePath(p);
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Payments — verify or reject a buyer's transfer receipt (the escrow gate)
 *
 * All of it — the "already verified" check, the stock release, cancelling the
 * unpaid order, the buyer notification, the subscription window, the seller
 * notification — is `admin_verify_payment` in SQL. This action only authorises
 * and forwards.
 * ──────────────────────────────────────────────────────────────────────────── */
export async function verifyPayment(
  paymentId: string,
  approve: boolean,
  reason?: string,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return { ok: false, error: admin.error };
  if (!hasAdminKey) return { ok: false, error: NO_KEY };
  if (!approve && !reason?.trim()) {
    return { ok: false, error: "A reason is required when rejecting." };
  }

  try {
    const supabase = createAdminClient();

    const { error } = await supabase.rpc("admin_verify_payment", {
      p_payment_id: paymentId,
      p_approve: approve,
      p_reason: approve ? null : reason!.trim(),
      p_actor: admin.userId,
    });
    if (error) return fail(error);

    // A verified subscription changes what the SELLER sees, not just the
    // admin. Without these paths the seller's subscription page kept serving
    // its cached render and still showed the old plan/status.
    refreshAdmin(["/seller/subscription", "/seller/analytics", "/seller"]);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Payouts
 * ──────────────────────────────────────────────────────────────────────────── */
export async function markPayoutPaid(
  payoutId: string,
  reference?: string,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return { ok: false, error: admin.error };
  if (!hasAdminKey) return { ok: false, error: NO_KEY };

  try {
    const supabase = createAdminClient();

    const { error } = await supabase.rpc("admin_mark_payout_paid", {
      p_payout_id: payoutId,
      p_reference: reference?.trim() || null,
      p_actor: admin.userId,
    });
    if (error) return fail(error);

    refreshAdmin();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Disputes
 *
 * The payout hold (`payout_hold_days`) and the buyer/seller branches are
 * `admin_resolve_dispute` in SQL — including the hold that the TS copy used to
 * hardcode to one day.
 * ──────────────────────────────────────────────────────────────────────────── */
export async function resolveDispute(
  disputeId: string,
  outcome: "resolved_buyer" | "resolved_seller",
  note: string,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return { ok: false, error: admin.error };
  if (!hasAdminKey) return { ok: false, error: NO_KEY };
  if (note.trim().length < 5) {
    return { ok: false, error: "Add a one-line resolution note." };
  }

  try {
    const supabase = createAdminClient();

    const { error } = await supabase.rpc("admin_resolve_dispute", {
      p_dispute_id: disputeId,
      p_outcome: outcome,
      p_note: note.trim(),
      p_actor: admin.userId,
    });
    if (error) return fail(error);

    refreshAdmin();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Sellers
 *
 * Approving publishes hidden listings and grants the new-seller boost;
 * suspending/rejecting hides live listings. That is `admin_set_shop_status`.
 * ──────────────────────────────────────────────────────────────────────────── */
export async function setShopStatus(
  shopId: string,
  status: "pending" | "approved" | "suspended" | "rejected",
  note?: string | null,
  verified?: boolean | null,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return { ok: false, error: admin.error };
  if (!hasAdminKey) return { ok: false, error: NO_KEY };
  if (status !== "approved" && !note?.trim()) {
    return { ok: false, error: "Write a short message — the seller receives it." };
  }

  try {
    const supabase = createAdminClient();

    const { error } = await supabase.rpc("admin_set_shop_status", {
      p_shop_id: shopId,
      p_status: status,
      p_note: note?.trim() || null,
      p_verified: typeof verified === "boolean" ? verified : null,
      p_actor: admin.userId,
    });
    if (error) return fail(error);

    refreshAdmin();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

/**
 * Suspend / unsuspend a shop.
 *
 * This is `admin_set_shop_status` with the two statuses the toggle maps to, so
 * the listing-visibility rule is not written a second time here.
 */
export async function toggleShopSuspend(
  shopId: string,
  action: "suspend" | "reactivate",
  reason?: string,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return { ok: false, error: admin.error };
  if (!hasAdminKey) return { ok: false, error: NO_KEY };

  // ── Why this takes the ACTION, not the current state ──────────────────
  // It used to take `suspended: boolean` — the shop's CURRENT status — and
  // write `suspended ? 'suspended' : 'approved'`. The caller passed
  // `status === 'suspended'`, so clicking "Reactivate" on a suspended shop
  // passed `true` and wrote 'suspended' again. The button could suspend but
  // never reactivate, and it reported success both times.
  //
  // Naming the transition removes the whole class of bug: there is no way
  // to express "set it to what it already is".
  if (action === "suspend" && !reason?.trim()) {
    return { ok: false, error: "Write a short reason — the seller receives it." };
  }

  try {
    const supabase = createAdminClient();

    const { error } = await supabase.rpc("admin_set_shop_status", {
      p_shop_id: shopId,
      p_status: action === "suspend" ? "suspended" : "approved",
      p_note: action === "suspend" ? reason!.trim() : null,
      p_verified: null,
      p_actor: admin.userId,
    });
    if (error) return fail(error);

    refreshAdmin();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Reviews
 * ──────────────────────────────────────────────────────────────────────────── */
export async function moderateReview(
  reviewId: string,
  status: "published" | "hidden",
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return { ok: false, error: admin.error };
  if (!hasAdminKey) return { ok: false, error: NO_KEY };

  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("reviews").update({ status }).eq("id", reviewId);
    if (error) return fail(error);
    refreshAdmin();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Buyers
 * ──────────────────────────────────────────────────────────────────────────── */
/**
 * Suspend, ban or reactivate ANY account — buyer or seller.
 *
 * ── Why this replaced `setBuyerBanned` ────────────────────────────────
 * The old action wrote `profiles.is_banned` directly with the service-role
 * client. That is a raw UPDATE, and it had two problems:
 *
 *   1. It only ever touched `profiles`. A banned SELLER kept a live shop
 *      and kept selling — the console had no way to take a seller's
 *      account down at all, only their shop.
 *   2. It collapsed three different states into one boolean. "Suspended"
 *      (temporary, reversible, you can still read your orders) and
 *      "banned" (permanent) are different things to the person on the
 *      other end, and the console needs to say which one it did.
 *
 * `admin_moderate_user` (sql/0047) owns the transition: it writes the
 * status, the reason, the expiry and the audit columns, keeps the legacy
 * `is_banned` in step so the fifteen checkout RPCs that read it stay
 * correct, and takes a seller's shop down with them.
 *
 * `p_actor` is passed explicitly because a Server Action runs with the
 * service-role client, where `auth.uid()` is null — the RPC cannot infer
 * who is acting, and the audit trail needs to know.
 */
export async function moderateUser(
  userId: string,
  action: "suspend" | "ban" | "reactivate",
  reason?: string,
  until?: string | null,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return { ok: false, error: admin.error };
  if (!hasAdminKey) return { ok: false, error: NO_KEY };

  if (action !== "reactivate" && !reason?.trim()) {
    return { ok: false, error: "Write a short reason — the account holder sees it." };
  }

  try {
    const supabase = createAdminClient();

    const { error } = await supabase.rpc("admin_moderate_user", {
      p_user_id: userId,
      p_action: action,
      p_reason: action === "reactivate" ? null : reason!.trim(),
      p_actor: admin.userId,
      p_until: action === "suspend" ? (until ?? null) : null,
    });
    if (error) return fail(error);

    refreshAdmin();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Platform settings
 * ──────────────────────────────────────────────────────────────────────────── */
export async function saveSettings(input: {
  commission_rate: number;
  subscription_price: number;
  default_delivery_fee: number;
  free_delivery_default: number;
  terms_text: string;
}): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return { ok: false, error: admin.error };
  if (!hasAdminKey) return { ok: false, error: NO_KEY };

  if (!Number.isFinite(input.commission_rate) || input.commission_rate < 0 || input.commission_rate > 1) {
    return { ok: false, error: "Commission must be between 0 and 100%." };
  }

  try {
    const supabase = createAdminClient();
    const { error } = await supabase
      .from("platform_settings")
      .update({
        commission_rate: input.commission_rate,
        subscription_price: input.subscription_price,
        default_delivery_fee: input.default_delivery_fee,
        free_delivery_default: input.free_delivery_default,
        terms_text: input.terms_text,
      })
      .eq("id", 1);
    if (error) return fail(error);

    refreshAdmin(["/checkout", "/seller/subscription"]);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

/**
 * The login page video, editable from the dashboard.
 *
 * ── Why this is a setting and not a file swap ─────────────────────────
 * The video used to be hardcoded to `/media/signin.mp4` in the component,
 * so changing it meant a code change and a deploy. It now lives in
 * `platform_settings` (sql/0047), which the login page already reads
 * through the publicly-readable `settings_read` policy — so the page can
 * render it without a service key, and a change here is live on the next
 * request.
 *
 * An empty value is meaningful: it means "use the bundled file". That
 * keeps a fresh install working before anyone uploads anything, and it
 * gives the admin a way back to the default without knowing the path.
 *
 * Only http(s) URLs are accepted. A `javascript:` or `data:` URL in a
 * `<video src>` is an injection vector, and this value is rendered on the
 * one page every signed-out visitor sees.
 */
export async function saveLoginVideo(input: {
  video_url: string;
  poster_url: string;
}): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return { ok: false, error: admin.error };
  if (!hasAdminKey) return { ok: false, error: NO_KEY };

  const clean = (raw: string, label: string): { ok: true; value: string } | { ok: false; error: string } => {
    const v = (raw ?? "").trim();
    if (v === "") return { ok: true, value: "" };
    if (!/^https?:\/\//i.test(v)) {
      return { ok: false, error: `${label} must be a full http(s) URL, or empty to use the default.` };
    }
    if (v.length > 2048) return { ok: false, error: `${label} is too long.` };
    return { ok: true, value: v };
  };

  const video = clean(input.video_url, "Video URL");
  if (!video.ok) return { ok: false, error: video.error };
  const poster = clean(input.poster_url, "Poster URL");
  if (!poster.ok) return { ok: false, error: poster.error };

  try {
    const supabase = createAdminClient();
    const { error } = await supabase
      .from("platform_settings")
      .update({
        login_video_url: video.value,
        login_video_poster_url: poster.value,
      })
      .eq("id", 1);
    if (error) return fail(error);

    // The login page is a Server Component that reads this row, so it has
    // to be revalidated or the old video keeps rendering from cache.
    refreshAdmin(["/auth", "/signin"]);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
 * General notifications (broadcast)
 *
 * An admin sends one message to buyers, sellers, or everyone. It is stored as
 * one `notifications` row PER RECIPIENT rather than a single shared row with a
 * read flag, because "read" is per person: a shared row cannot express "buyer A
 * has seen this and buyer B has not", and the unread badge would be wrong for
 * everyone.
 *
 * The fan-out is done in batches. A single insert of 50,000 rows would time out
 * and, worse, would either all land or none — a partial send is far more
 * confusing than a slow one. Batching means a failure halfway through leaves a
 * known number delivered, which the result reports honestly.
 * ──────────────────────────────────────────────────────────────────────────── */

export type BroadcastAudience = "buyers" | "sellers" | "everyone";

export type BroadcastResult = ActionResult & {
  sent?: number;
  audience?: BroadcastAudience;
  broadcastId?: string;
};

const BATCH = 500;

export async function sendBroadcast(input: {
  title: string;
  body: string;
  audience: BroadcastAudience;
  href?: string;
}): Promise<BroadcastResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return { ok: false, error: admin.error };
  if (!hasAdminKey) return { ok: false, error: NO_KEY };

  const title = input.title.trim();
  const body = input.body.trim();
  if (title.length < 3) return { ok: false, error: "Give the notification a title." };
  if (body.length < 3) return { ok: false, error: "Write the message you want to send." };
  if (title.length > 120) return { ok: false, error: "Keep the title under 120 characters." };
  if (body.length > 1000) return { ok: false, error: "Keep the message under 1000 characters." };

  try {
    const supabase = createAdminClient();

    // Resolve the audience to a list of user ids.
    //
    // Sellers are identified by owning a shop, not by profiles.role — a user
    // can be a buyer who later opened a shop, and their role column may still
    // say 'buyer'. Ownership is the fact that matters.
    let userIds: string[] = [];

    if (input.audience === "sellers") {
      const { data: shops, error } = await supabase.from("shops").select("owner_id").not("owner_id", "is", null);
      if (error) return fail(error);
      userIds = Array.from(new Set((shops ?? []).map((s: { owner_id: string }) => s.owner_id).filter(Boolean)));
    } else if (input.audience === "buyers") {
      const { data: shops } = await supabase.from("shops").select("owner_id").not("owner_id", "is", null);
      const sellerIds = new Set((shops ?? []).map((s: { owner_id: string }) => s.owner_id).filter(Boolean));
      const { data: people, error } = await supabase.from("profiles").select("id").eq("is_banned", false);
      if (error) return fail(error);
      userIds = (people ?? [])
        .map((p: { id: string }) => p.id)
        .filter((id: string) => !sellerIds.has(id));
    } else {
      const { data: people, error } = await supabase.from("profiles").select("id").eq("is_banned", false);
      if (error) return fail(error);
      userIds = (people ?? []).map((p: { id: string }) => p.id);
    }

    if (userIds.length === 0) {
      return { ok: false, error: "There is nobody in that audience yet." };
    }

    const broadcastId = crypto.randomUUID();
    const href = input.href?.trim() || null;
    let sent = 0;

    for (let i = 0; i < userIds.length; i += BATCH) {
      const slice = userIds.slice(i, i + BATCH);
      const { error } = await supabase.from("notifications").insert(
        slice.map((uid) => ({
          user_id: uid,
          kind: "broadcast" as const,
          title,
          body,
          href,
          broadcast_id: broadcastId,
        })),
      );
      if (error) {
        // Report what actually went out rather than claiming success.
        return {
          ok: false,
          error: `Sent to ${sent} of ${userIds.length} before failing: ${error.message}`,
          sent,
          audience: input.audience,
          broadcastId,
        };
      }
      sent += slice.length;
    }

    refreshAdmin(["/notifications"]);
    return { ok: true, sent, audience: input.audience, broadcastId };
  } catch (error) {
    return fail(error);
  }
}

export async function addCategory(name: string, slug: string, sortOrder: number): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return { ok: false, error: admin.error };
  if (!hasAdminKey) return { ok: false, error: NO_KEY };
  if (name.trim().length < 2) return { ok: false, error: "Give the category a name." };

  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("categories").insert({
      name: name.trim(),
      slug,
      sort_order: sortOrder,
      icon: "🏷️",
    });
    if (error) return fail(error);
    refreshAdmin();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function toggleCategory(id: string, active: boolean): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return { ok: false, error: admin.error };
  if (!hasAdminKey) return { ok: false, error: NO_KEY };

  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("categories").update({ active: !active }).eq("id", id);
    if (error) return fail(error);
    refreshAdmin();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}
