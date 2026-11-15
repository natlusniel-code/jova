-- =====================================================================
-- NaijaMart — 0044 Email verification by link
-- =====================================================================
-- Replaces the old "retype the code shown on screen" method. That method
-- proved nothing: the code was displayed to whoever was already at the
-- keyboard, so it verified nothing about the email address. Accounts are now
-- confirmed by a link sent to the address itself.
--
-- The token lives in `one_time_codes` (purpose 'verify') so it inherits the
-- existing expiry and single-use handling, and the confirmed state lives on
-- `profiles.email_verified_at`.

alter table public.profiles
  add column if not exists email_verified_at timestamptz;

-- ── Backfill ──────────────────────────────────────────────────────────────
-- Every account that exists today was created under the old flow and is
-- already in use. Marking them verified is what stops this change from
-- locking out the entire existing user base.
update public.profiles
   set email_verified_at = coalesce(email_verified_at, created_at, now())
 where email_verified_at is null;

-- ── Issue a verification token ────────────────────────────────────────────
-- 32 hex characters: long enough that it cannot be guessed, short enough to
-- sit in a URL. Any previous unused token for the address is replaced, so a
-- "resend" invalidates the older link rather than leaving two live.
--
-- `gen_random_uuid()` is used rather than `gen_random_bytes()`: the latter
-- lives in the `extensions` schema on Supabase and is not on this function's
-- `search_path`, which made every call fail. See sql/0045.
create or replace function public.nm_issue_verify_token(p_email text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(btrim(p_email));
  v_token text;
begin
  if v_email = '' or v_email is null then
    raise exception 'An email address is required.';
  end if;

  delete from public.one_time_codes
   where email = v_email and purpose = 'verify';

  v_token := replace(gen_random_uuid()::text, '-', '');

  insert into public.one_time_codes (email, purpose, code, expires_at)
  values (v_email, 'verify', v_token, now() + interval '48 hours');

  return v_token;
end $$;

grant execute on function public.nm_issue_verify_token(text) to service_role;

-- ── Consume it ────────────────────────────────────────────────────────────
-- Returns the email the token belonged to, or null when the token is unknown,
-- already used, or expired. Single use: the row is deleted on success, so a
-- link cannot be replayed from a mail archive.
create or replace function public.nm_consume_verify_token(p_token text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_row public.one_time_codes;
begin
  select * into v_row
    from public.one_time_codes
   where code = btrim(p_token) and purpose = 'verify'
   limit 1;

  if not found then return null; end if;

  if v_row.expires_at < now() then
    delete from public.one_time_codes where code = v_row.code and purpose = 'verify';
    return null;
  end if;

  delete from public.one_time_codes where code = v_row.code and purpose = 'verify';

  update public.profiles
     set email_verified_at = now()
   where lower(email) = v_row.email;

  return v_row.email;
end $$;

grant execute on function public.nm_consume_verify_token(text) to service_role;

-- ── Is this address verified? ─────────────────────────────────────────────
-- Used by the sign-in action to refuse an unverified account with a clear
-- message instead of a generic "wrong password".
create or replace function public.nm_email_verified(p_email text)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select p.email_verified_at is not null
       from public.profiles p
      where lower(p.email) = lower(btrim(p_email))
      limit 1),
    false
  );
$$;

grant execute on function public.nm_email_verified(text) to service_role;
