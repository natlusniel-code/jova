-- 0048 — Web Push actually delivers
--
-- ── The bug ────────────────────────────────────────────────────────────────
-- Push notifications never arrived, and the reason was not the client, the
-- VAPID pair, or the service worker. It was a missing GRANT.
--
-- sql/0022 created `claim_unpushed_notifications()` and then did this:
--
--     revoke all on function public.claim_unpushed_notifications(int) from public;
--     revoke all on function public.claim_unpushed_notifications(int) from anon;
--     revoke all on function public.claim_unpushed_notifications(int) from authenticated;
--
-- …and stopped there. It never granted EXECUTE to `service_role`. The
-- dispatcher (src/lib/push.ts) calls that RPC with the service-role client, so
-- every single dispatch failed with:
--
--     permission denied for function claim_unpushed_notifications
--
-- `dispatchPush()` returned `{ ok: false, error: "permission denied…" }`, the
-- caller in the page layout is fire-and-forget (`void dispatchPushThrottled()`)
-- and swallows the rejection, and /api/jobs/run reports the error in a JSON
-- field nobody reads. So the failure was completely silent: notifications were
-- written to the table, the bell counted them, and no push was ever sent.
--
-- The same omission applies to `prune_push_subscription()`, which the
-- dispatcher calls to drop a dead endpoint. Without the grant, a subscription
-- the push service has discarded (404/410) is never removed, so every future
-- send to that device fails again — a permanent, growing failure loop.
--
-- ── The fix ────────────────────────────────────────────────────────────────
-- Grant EXECUTE on both functions to `service_role` only. They stay revoked
-- from anon/authenticated: `claim_unpushed_notifications` reads every user's
-- notifications and stamps `pushed_at`, which no browser may do.
--
-- ── Also: the kind constraint ──────────────────────────────────────────────
-- `notifications.kind` is checked against a fixed list. sql/0022 set it to
-- four values ('order','chat','broadcast','system') and sql/0028 widened it to
-- six (adding 'promo','delivery'). A project that applied 0022 but not 0028
-- rejects any 'promo' or 'delivery' row at INSERT time — the notification is
-- never written, so it can never be pushed. Re-asserting the six-value list
-- here makes the schema correct regardless of which migrations ran.
--
-- Idempotent: safe to run more than once.

-- 1. Let the dispatcher call the claim RPC --------------------------------
grant execute on function public.claim_unpushed_notifications(int) to service_role;

-- 2. Let the dispatcher prune a dead subscription -------------------------
grant execute on function public.prune_push_subscription(text) to service_role;

-- 3. Keep both closed to the browser --------------------------------------
-- Re-stated so a later `grant all on all functions` cannot quietly reopen them.
revoke all on function public.claim_unpushed_notifications(int) from public;
revoke all on function public.claim_unpushed_notifications(int) from anon;
revoke all on function public.claim_unpushed_notifications(int) from authenticated;
revoke all on function public.prune_push_subscription(text) from public;
revoke all on function public.prune_push_subscription(text) from anon;
revoke all on function public.prune_push_subscription(text) from authenticated;

-- 4. The full set of notification kinds -----------------------------------
-- 'delivery' is written by the order-lifecycle triggers (sql/0028); 'promo' by
-- the offers path. Both are declared in src/lib/notification-source.ts, so the
-- database must accept them or the row is dropped before it can be pushed.
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications
  add constraint notifications_kind_check
  check (kind in ('order', 'chat', 'broadcast', 'system', 'promo', 'delivery'));

-- 5. Make sure the dispatcher's partial index exists ----------------------
-- Without it the claim query scans the whole notifications table on every
-- page load, which is the throttle's worst case.
create index if not exists notifications_unpushed_idx
  on public.notifications(created_at)
  where pushed_at is null;

-- 6. Release a claim that could not be delivered --------------------------
-- `claim_unpushed_notifications` stamps `pushed_at` as it reads, which is what
-- stops two overlapping polls double-sending. The cost is that a row is marked
-- delivered BEFORE the send is attempted: if the push service is down, or the
-- request is cut off by the serverless timeout, that notification is lost for
-- good — it will never be claimed again.
--
-- This lets the dispatcher put a failed row back in the queue. It is called
-- only for rows where every device failed, so a partial success is not
-- re-sent to the devices that already got it.
create or replace function public.release_notification_claim(p_ids uuid[])
returns int
language sql
security definer
set search_path = public
as $$
  with released as (
    update public.notifications n
       set pushed_at = null
     where n.id = any(p_ids)
       and n.pushed_at is not null
    returning n.id
  )
  select count(*)::int from released;
$$;

revoke all on function public.release_notification_claim(uuid[]) from public;
revoke all on function public.release_notification_claim(uuid[]) from anon;
revoke all on function public.release_notification_claim(uuid[]) from authenticated;
grant execute on function public.release_notification_claim(uuid[]) to service_role;

notify pgrst, 'reload schema';
