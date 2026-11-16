import "server-only";
import { createAdminClient } from "./supabase/admin";
import { webPushConfigOrNull, type WebPushConfig } from "./push-private";
import { sendPush, type PushTarget } from "./webpush";
import { notificationTitle, notificationBody, sourceFor } from "./notification-source";

/* Server-side Web Push dispatch.
 *
 * Before this, nothing ever sent a push: the client could only raise an OS
 * notification while the tab was open, `push_subscriptions` stayed empty, and
 * no VAPID key existed — so "notifications are not pushing" was literal.
 *
 * Every notification (order, chat, broadcast) is a row in
 * `public.notifications`. This claims the un-pushed rows and sends each to
 * that user's devices — one path, so any feature that writes a row is pushed
 * automatically, for buyers, sellers and admins alike.
 *
 * The VAPID key pair is the site's original pair, restored in code in
 * `push-private.ts` / `push-public.ts` after the move to environment variables
 * broke delivery. It is the same pair existing subscribers are bound to, so
 * they receive notifications again without re-subscribing. */

/** The VAPID triple. Always present — the pair lives in code. */
function vapid(): WebPushConfig | null {
  return webPushConfigOrNull();
}

export function pushConfigured(): boolean {
  return vapid() !== null;
}

type Claimed = {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
};

export type DispatchResult = {
  ok: boolean;
  configured: boolean;
  claimed: number;
  sent: number;
  failed: number;
  pruned: number;
  error?: string;
};

/**
 * Claim un-pushed notifications and deliver them.
 *
 * `claim_unpushed_notifications` (sql/0022) stamps `pushed_at` as it returns
 * rows, so two overlapping polls cannot double-send.
 */
export async function dispatchPush(limit = 50): Promise<DispatchResult> {
  const base: DispatchResult = {
    ok: false,
    configured: pushConfigured(),
    claimed: 0,
    sent: 0,
    failed: 0,
    pruned: 0,
  };

  const config = vapid();
  if (!config) {
    return { ...base, error: "Web Push is not configured: no VAPID key pair." };
  }

  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc("claim_unpushed_notifications", {
    p_limit: limit,
  });
  if (error) return { ...base, error: error.message };

  const rows = (data ?? []) as Claimed[];
  if (!rows.length) return { ...base, ok: true };

  // One query for all devices involved, not one per row.
  const { data: subs, error: subErr } = await supabase
    .from("push_subscriptions")
    .select("endpoint,p256dh,auth,user_id")
    .in("user_id", Array.from(new Set(rows.map((r) => r.user_id))));

  if (subErr) return { ...base, claimed: rows.length, error: subErr.message };

  const byUser = new Map<string, PushTarget[]>();
  for (const s of subs ?? []) {
    const list = byUser.get(s.user_id) ?? [];
    list.push({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth });
    byUser.set(s.user_id, list);
  }

  let sent = 0;
  let failed = 0;
  let pruned = 0;
  let lastError: string | undefined;
  // Rows where EVERY device failed. They are put back in the queue below.
  const undelivered: string[] = [];

  for (const row of rows) {
    const targets = byUser.get(row.user_id) ?? [];
    if (!targets.length) continue; // no device registered — nothing to do

    // The title names WHERE the notification came from — "Message from Ada",
    // "Order update — ...", "NaijaMart — ..." — instead of showing the raw
    // row title with no origin. See src/lib/notification-source.ts.
    const payload = {
      title: notificationTitle(row.kind, row.title),
      body: notificationBody(row.kind, row.body),
      url: row.href ?? sourceFor(row.kind).href,
      tag: row.id,
      kind: row.kind,
      // The green cart on transparency, not the full app tile: a push icon is
      // drawn on the OS's own background, so a tile would show as a white
      // square (which is exactly the bug that was reported).
      icon: "/notification-icon-192.png",
      badge: "/notification-icon-96.png",
    };

    let rowSent = 0;
    for (const t of targets) {
      const outcome = await sendPush(t, payload, config);
      if (outcome.ok) {
        sent += 1;
        rowSent += 1;
      } else {
        failed += 1;
        lastError = outcome.error;
        // The push service discarded this subscription; keeping it would make
        // every future send fail.
        if (outcome.gone) {
          await supabase.rpc("prune_push_subscription", { p_endpoint: t.endpoint });
          pruned += 1;
        }
      }
    }

    // Nothing reached any device: hand the row back so the next flush retries
    // it. Without this the claim had already stamped `pushed_at`, so a push
    // service outage silently ate every notification in the batch.
    if (rowSent === 0) undelivered.push(row.id);
  }

  // Best-effort: a failure here only means the rows wait for a manual retry,
  // which is still better than reporting them delivered.
  if (undelivered.length) {
    const { error: releaseErr } = await supabase.rpc("release_notification_claim", {
      p_ids: undelivered,
    });
    if (releaseErr) lastError = `${lastError ?? ""} release: ${releaseErr.message}`.trim();
  }

  return {
    ok: true,
    configured: true,
    claimed: rows.length,
    sent,
    failed,
    pruned,
    error: lastError,
  };
}

/* ── Opportunistic dispatch ──────────────────────────────────────────────────
 * Vercel's Hobby plan only permits a daily cron, so a scheduled flush cannot
 * be relied on. Instead the dispatcher is driven from the pages themselves:
 * a cheap, throttled call on navigation, plus the explicit /api/jobs/run
 * endpoint. Both are safe to overlap because `claim_unpushed_notifications`
 * stamps `pushed_at` as it reads.
 *
 * The throttle is per server instance and short (20s), so a navigation storm
 * costs one indexed query at most, while a new notification still goes out
 * within a page load rather than waiting for a schedule. */
let lastRun = 0;
let inFlight: Promise<DispatchResult> | null = null;

export async function dispatchPushThrottled(windowMs = 20_000): Promise<void> {
  const now = Date.now();
  if (now - lastRun < windowMs) return; // recently flushed
  if (inFlight) return; // a flush is already running on this instance
  lastRun = now;
  inFlight = dispatchPush(25).finally(() => {
    inFlight = null;
  });
  try {
    await inFlight;
  } catch {
    // Never let a delivery problem break a page render.
  }
}

/**
 * Flush the queue from a page render, bounded so it cannot hang the page.
 *
 * ── Why this is awaited, and why it has a cap ──────────────────────────────
 * The layouts used to call `void dispatchPushThrottled()`. On a serverless
 * host that is a silent no-op: the response is sent, the function instance is
 * frozen, and the un-awaited promise is killed mid-flight. The push was
 * claimed (so `pushed_at` was stamped) and then never sent — the notification
 * was lost for good, because the claim had already marked it delivered.
 *
 * So the work has to finish inside the request. It is capped at
 * `timeoutMs` so a slow push service cannot hold a page open: the throttle
 * means only one page load in the window pays this at all, and the cap keeps
 * even that bounded. A flush that hits the cap is not lost — the rows it did
 * not reach are still unclaimed and go out on the next flush.
 */
export async function dispatchPushSafely(timeoutMs = 3_000): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      dispatchPushThrottled(),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, timeoutMs);
      }),
    ]);
  } catch {
    // A delivery problem must never break a page render.
  } finally {
    if (timer) clearTimeout(timer);
  }
}
