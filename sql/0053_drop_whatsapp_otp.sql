-- 0053_drop_whatsapp_otp.sql
--
-- Removes the WhatsApp OTP sign-in flow.
--
-- ── Why a new migration and not an edit to 0051 ─────────────────────────────
-- 0051 and 0052 have already been applied to the production database. Editing
-- an applied migration changes the file without changing the database, so the
-- two silently disagree and a fresh environment no longer matches production.
-- The only honest way to remove something is a new migration that undoes it.
--
-- ── What is being removed ───────────────────────────────────────────────────
-- Clerk is the identity provider now. It verifies the credential, so Jova no
-- longer issues or checks one-time codes of its own. The route
-- (`/api/auth/whatsapp-otp`), the page (`/auth/whatsapp`) and the client form
-- are deleted in the same change; this drops the storage behind them.
--
-- ── Why the functions go before the table ───────────────────────────────────
-- `nm_issue_whatsapp_otp` and `nm_verify_whatsapp_otp` are SECURITY DEFINER
-- functions granted to `service_role`. Dropping the table first would leave
-- them callable and failing at runtime; dropping them first means the surface
-- is gone before the storage is.
--
-- ── Why `if exists` everywhere ──────────────────────────────────────────────
-- A database that never ran 0051 (a fresh local environment) must not fail
-- here. This migration is a no-op on such a database, which is correct.

begin;

-- 1. The callable surface.
drop function if exists public.nm_verify_whatsapp_otp(text, text);
drop function if exists public.nm_issue_whatsapp_otp(text, text, uuid, text);

-- 2. The storage. `cascade` is deliberate: the table's indexes and any policy
--    attached to it go with it, and nothing else references it.
drop table if exists public.whatsapp_otp_challenges cascade;

-- 3. The uniqueness constraint 0052 added on `profiles.phone`.
--
--    That constraint existed to stop two accounts claiming the same verified
--    phone. It was tied to the OTP flow: the phone was only trustworthy
--    because an OTP had proved it. Without OTP, `profiles.phone` is a
--    self-declared contact number, and a hard unique index on a self-declared
--    value locks a real person out of signing up because someone else typed
--    their number. The column stays (support and delivery still need it); the
--    uniqueness goes.
--
--    The index name is looked up rather than assumed, because 0052 may have
--    created it under either a constraint or a bare index.
do $$
declare
  idx record;
begin
  for idx in
    select indexname
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'profiles'
      and indexdef ilike '%(phone)%'
      and indexdef ilike '%unique%'
  loop
    execute format('drop index if exists public.%I', idx.indexname);
  end loop;
end $$;

commit;
