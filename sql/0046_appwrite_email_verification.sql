-- =====================================================================
-- Jova — 0046 Email verification through Appwrite
-- =====================================================================
-- The app no longer sends its own verification mail. There is no Resend
-- key, no EMAIL_FROM and no SMTP configuration: Appwrite's built-in SMTP
-- mails a 6-digit code, and the app confirms it with Appwrite.
--
-- What changes here is only the *flag*. `profiles.email_verified_at` stays
-- the single column the marketplace reads — RLS policies, the sign-in gate
-- and every page already use it, and none of them should have to talk to
-- Appwrite to find out whether an address is confirmed.
--
-- So this migration adds one narrow function that sets the flag, callable
-- only by the service role. It replaces nothing: `nm_email_verified` from
-- 0044 is still the read side, and the old `nm_issue_verify_token` /
-- `nm_consume_verify_token` pair is left in place untouched. Dropping them
-- would break nothing today, but a rollback would then need a migration in
-- the middle of an auth outage, so they stay and simply stop being called.

-- ── Mark an address verified ────────────────────────────────────────────
-- Called by `confirmEmailCodeAction` after Appwrite has confirmed the code.
-- Idempotent: confirming twice (two tabs, a retry) must not move the
-- timestamp or fail.
--
-- It returns the email that was marked, or null when no profile matched.
-- A null is not treated as an error by the caller — the Appwrite side is
-- the source of truth for the code, and a person whose profile row has not
-- materialised yet (a trigger still running) gets it set on next sign-in.
create or replace function public.nm_set_email_verified(p_email text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_found text;
begin
  if v_email = '' then
    return null;
  end if;

  update public.profiles
     set email_verified_at = coalesce(email_verified_at, now())
   where lower(email) = v_email
  returning lower(email) into v_found;

  return v_found;
end $$;

revoke all on function public.nm_set_email_verified(text) from public;
grant execute on function public.nm_set_email_verified(text) to service_role;

-- ── Verified flag on the sign-in path ───────────────────────────────────
-- `nm_email_verified` already exists from 0044 and is what the sign-in
-- action gates on. Restated here only so this migration is self-contained
-- for a database that skipped 0044: `create or replace` is a no-op when
-- the definition is the same, and repairs the grant when it is not.
create or replace function public.nm_email_verified(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.email_verified_at is not null
       from public.profiles p
      where lower(p.email) = lower(btrim(p_email))
      limit 1),
    false
  );
$$;

revoke all on function public.nm_email_verified(text) from public;
grant execute on function public.nm_email_verified(text) to service_role;

-- ── Backfill, for a database that never ran 0044 ────────────────────────
-- Every account that existed before email verification was introduced is
-- already in use. Leaving them unverified would lock the entire existing
-- user base out at sign-in, so they are marked confirmed. New signups are
-- the only accounts that have to prove their inbox.
update public.profiles
   set email_verified_at = coalesce(email_verified_at, created_at, now())
 where email_verified_at is null;

-- ── Keep the two copies of the truth in step ────────────────────────────
-- Appwrite owns the code and its expiry. Supabase owns the flag the app
-- reads. They are joined by the address, so a change of address must reset
-- the flag — otherwise an account could confirm one inbox and then be
-- signed in under a different, unverified one.
create or replace function public.nm_reset_verified_on_email_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is distinct from old.email then
    new.email_verified_at := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_profiles_reset_verified on public.profiles;
create trigger trg_profiles_reset_verified
  before update of email on public.profiles
  for each row
  execute function public.nm_reset_verified_on_email_change();

notify pgrst, 'reload schema';
