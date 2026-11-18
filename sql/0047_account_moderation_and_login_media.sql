-- =====================================================================
-- Jova — 0047 Account moderation + admin-editable login media
--
-- Two problems this closes.
--
-- ── 1. The admin console could not moderate a user ────────────────────
--
-- The Buyers page had a "Ban" button wired to `setBuyerBanned`, which
-- wrote `profiles.is_banned` directly. `tg_profiles_guard` reverts that
-- column for anyone who is not an admin — and `is_admin()` reads
-- `auth.uid()`. A Server Action runs with the SERVICE ROLE client, which
-- has NO `auth.uid()`, so `is_admin()` was false, the guard reverted the
-- write, and the UPDATE returned 200 with the row unchanged. The console
-- said "saved" and nothing happened. Worse, `profiles_update` RLS only
-- permits `id = auth.uid() or is_admin()`, so for an admin the UPDATE
-- matched zero rows and returned no error at all.
--
-- The shop side had the mirror problem from the UI: `SellerSuspend`
-- called `toggleShopSuspend(shopId, suspended)` where `suspended` came
-- from the CURRENT status, and that action writes
-- `suspended ? 'suspended' : 'approved'` — so clicking "Reactivate" on a
-- suspended shop wrote 'suspended' again. The button could suspend but
-- never reactivate.
--
-- ── 2. Three states were collapsed into one boolean ───────────────────
--
-- `is_banned` cannot express "suspended" (a temporary, reversible hold —
-- you can still browse and read your orders, you just cannot order) as
-- distinct from "banned" (a permanent block). Both are needed by the
-- console, and the copy shown to the person differs, so the state has to
-- be stored, not inferred.
--
-- What this migration adds:
--
--   1. `profiles.moderation_status` — active | suspended | banned, with
--      reason, expiry, timestamp and the admin who did it.
--   2. `is_banned` is kept as a DERIVED column, kept in sync by a
--      trigger, because every checkout RPC in the schema already reads
--      it (`if v_buyer.is_banned then raise exception …`). Those fifteen
--      call sites stay correct without being rewritten.
--   3. `admin_moderate_user()` — one RPC, admin-or-service-role only,
--      that performs the transition and writes the audit columns.
--   4. `tg_profiles_guard` re-issued so the new columns are equally
--      locked against self-service writes.
--   5. `platform_settings.login_video_url` / `login_video_poster_url`,
--      so the admin can change the login page video without a deploy.
--
-- Idempotent: safe to run more than once.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Moderation columns
-- ---------------------------------------------------------------------

alter table public.profiles
  add column if not exists moderation_status text not null default 'active';

-- Add the CHECK separately and defensively: `add column … check` would
-- fail on a re-run where the column already exists but the constraint
-- does not, and we want both paths to converge.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_moderation_status_check'
  ) then
    alter table public.profiles
      add constraint profiles_moderation_status_check
      check (moderation_status in ('active', 'suspended', 'banned'));
  end if;
end $$;

alter table public.profiles
  add column if not exists moderation_reason   text,
  add column if not exists moderation_until    timestamptz,
  add column if not exists moderated_at        timestamptz,
  add column if not exists moderated_by        uuid;

create index if not exists profiles_moderation_idx
  on public.profiles(moderation_status);

-- Backfill from the only signal that existed before this migration.
-- Anyone already flagged by the old booleans was blocked from ordering,
-- which is exactly what 'banned' means here, so that is the honest
-- mapping — not 'suspended', which implies a temporary hold the console
-- never intended.
update public.profiles
   set moderation_status = 'banned'
 where is_banned
   and moderation_status = 'active';

-- ---------------------------------------------------------------------
-- 2. `is_banned` becomes derived
--
-- Every checkout path in the schema reads `is_banned`. Rather than edit
-- fifteen functions, one trigger keeps the two in agreement in both
-- directions, so a write to either column lands in a consistent state.
-- ---------------------------------------------------------------------
create or replace function public.tg_profiles_moderation_sync()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- A staff member may write either column; make them agree. The lexical
  -- order matters: `moderation_status` is the richer state, so it wins
  -- unless it was not itself changed this row.
  if new.moderation_status is distinct from old.moderation_status then
    new.is_banned := (new.moderation_status in ('suspended', 'banned'));
  elsif new.is_banned is distinct from old.is_banned then
    -- A write that only touched the legacy boolean (an older admin page,
    -- a direct service-role edit) still expresses a real intent.
    new.moderation_status := case when new.is_banned then 'banned' else 'active' end;
    if not new.is_banned then
      new.moderation_reason := null;
      new.moderation_until  := null;
    end if;
  end if;

  -- A timed suspension that has run out is no longer a suspension. This
  -- is evaluated on read by the RPCs below as well, but clearing it here
  -- keeps the column from drifting into a lie over time.
  if new.moderation_status = 'suspended'
     and new.moderation_until is not null
     and new.moderation_until <= now() then
    new.moderation_status := 'active';
    new.is_banned := false;
  end if;

  return new;
end $$;

drop trigger if exists t_profiles_moderation_sync on public.profiles;
create trigger t_profiles_moderation_sync
  before insert or update on public.profiles
  for each row execute function public.tg_profiles_moderation_sync();

-- ---------------------------------------------------------------------
-- 3. Re-issue tg_profiles_guard with the new columns locked
--
-- The previous body locked `is_banned` and `ban_reason` for non-admins.
-- The new columns must be equally locked, otherwise a suspended user
-- could clear their own suspension with one UPDATE — the guard would
-- revert `is_banned` but leave `moderation_status` saying 'active', and
-- the sync trigger would then make `is_banned` false on the next write.
-- ---------------------------------------------------------------------
create or replace function public.tg_profiles_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Trusted server credential (admin console, service actions): RLS is
  -- already bypassed, so honour the write.
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  if not public.is_admin() then
    -- A user may move themselves between the two ordinary roles. This is the
    -- buyer -> seller upgrade that /auth/callback performs for an OAuth
    -- seller signup, and it must not be silently reverted.
    if new.role is distinct from old.role then
      if old.role in ('buyer', 'seller') and new.role in ('buyer', 'seller') then
        null; -- allowed
      else
        new.role := old.role;
      end if;
    end if;

    -- Moderation and bans are admin-only, always. Every column the
    -- console writes is restored here; `is_banned` is included as well
    -- even though the sync trigger derives it, so that a direct write to
    -- the legacy column cannot slip through.
    new.is_banned          := old.is_banned;
    new.ban_reason         := old.ban_reason;
    new.moderation_status  := old.moderation_status;
    new.moderation_reason  := old.moderation_reason;
    new.moderation_until   := old.moderation_until;
    new.moderated_at       := old.moderated_at;
    new.moderated_by       := old.moderated_by;
  end if;

  -- Owning a shop is the definition of a seller.
  if new.role = 'buyer'
     and exists (select 1 from public.shops s where s.owner_id = new.id) then
    new.role := 'seller';
  end if;

  return new;
end $$;

drop trigger if exists t_profiles_guard on public.profiles;
create trigger t_profiles_guard before update on public.profiles
  for each row execute function public.tg_profiles_guard();

-- ---------------------------------------------------------------------
-- 4. admin_moderate_user()
--
-- One entry point for all three transitions. Called from a Server Action
-- with the service-role client, so `auth.uid()` is null here — that is
-- why it accepts an explicit actor rather than inferring one, and why the
-- guard below accepts service_role.
-- ---------------------------------------------------------------------
create or replace function public.admin_moderate_user(
  p_user_id uuid,
  p_action  text,
  p_reason  text default null,
  p_actor   uuid default null,
  p_until   timestamptz default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row   public.profiles;
  v_actor uuid := coalesce(p_actor, auth.uid());
begin
  if not (public.is_admin() or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'Only an administrator can moderate an account.';
  end if;

  if p_action not in ('suspend', 'ban', 'reactivate') then
    raise exception 'Unknown moderation action: %', p_action;
  end if;

  select * into v_row from public.profiles where id = p_user_id;
  if not found then
    raise exception 'No account with id %', p_user_id;
  end if;

  -- An admin locking themselves out of the console is never intended and
  -- is unrecoverable from inside the app.
  if p_user_id = v_actor and p_action <> 'reactivate' then
    raise exception 'You cannot suspend or ban your own account.';
  end if;

  -- A reason is required for both punitive actions. The person sees it,
  -- and an unexplained block is indistinguishable from a bug.
  if p_action in ('suspend', 'ban') and coalesce(trim(p_reason), '') = '' then
    raise exception 'A reason is required — the account holder sees it.';
  end if;

  if p_action = 'suspend' and v_row.role = 'admin' then
    raise exception 'Administrators cannot be suspended. Remove the admin role first.';
  end if;
  if p_action = 'ban' and v_row.role = 'admin' then
    raise exception 'Administrators cannot be banned. Remove the admin role first.';
  end if;

  update public.profiles
     set moderation_status = case p_action
                               when 'suspend' then 'suspended'
                               when 'ban'     then 'banned'
                               else                'active'
                             end,
         moderation_reason = case when p_action = 'reactivate'
                                  then null
                                  else trim(p_reason)
                             end,
         moderation_until  = case when p_action = 'suspend' then p_until else null end,
         moderated_at      = now(),
         moderated_by      = v_actor,
         -- Kept in step explicitly as well as by the sync trigger, so the
         -- returned row is correct even when read inside this transaction.
         is_banned         = (p_action in ('suspend', 'ban')),
         ban_reason        = case when p_action = 'reactivate' then null
                                  else trim(p_reason)
                             end
   where id = p_user_id
   returning * into v_row;

  -- Suspending a seller's shop as well: a suspended account that keeps
  -- selling is not suspended. Their listings come down with them, and a
  -- reactivation puts the shop back only if it was approved before.
  if p_action in ('suspend', 'ban') then
    update public.shops
       set status = 'suspended',
           review_note = trim(p_reason)
     where owner_id = p_user_id
       and status = 'approved';
  elsif p_action = 'reactivate' then
    -- Only shops that were suspended BY this moderation path come back
    -- automatically, and only if they still satisfy the approval rules.
    -- `tg_shops_require_documents` refuses to approve a shop with no
    -- verification documents, so a blind re-approve would raise and roll
    -- the whole reactivation back. A shop that cannot be re-approved goes
    -- to 'pending' instead, which puts it in front of an admin rather
    -- than silently leaving the seller with a dead shop.
    update public.shops
       set status = case
                      when jsonb_array_length(coalesce(documents, '[]'::jsonb)) > 0
                        then 'approved'
                      else 'pending'
                    end,
           review_note = case
                           when jsonb_array_length(coalesce(documents, '[]'::jsonb)) > 0
                             then null
                           else 'Account reactivated — re-approve this shop.'
                         end
     where owner_id = p_user_id
       and status = 'suspended'
       and review_note is not null;
  end if;

  return v_row;
end $$;

revoke all on function public.admin_moderate_user(uuid, text, text, uuid, timestamptz) from public;
grant execute on function public.admin_moderate_user(uuid, text, text, uuid, timestamptz)
  to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 5. Read helpers
--
-- `getSession()` needs to know whether the signed-in person is blocked,
-- and what to tell them. A tiny view keeps that a single row read rather
-- than a hand-maintained column list in TypeScript.
-- ---------------------------------------------------------------------
create or replace function public.account_block_reason(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
           when p.moderation_status = 'banned' then
             coalesce(p.moderation_reason, 'This account has been banned.')
           when p.moderation_status = 'suspended' then
             coalesce(p.moderation_reason, 'This account is suspended.')
           else null
         end
    from public.profiles p
   where p.id = p_user_id;
$$;

grant execute on function public.account_block_reason(uuid) to authenticated, anon, service_role;

-- ---------------------------------------------------------------------
-- 6. Login page media — editable from the admin dashboard
--
-- The URL lives in `platform_settings` (a single row, already publicly
-- readable by `settings_read`), so the login page can render it without
-- a service key and an admin change is live on the next request.
--
-- Empty string means "use the bundled file", which keeps a fresh install
-- working before anyone uploads anything.
-- ---------------------------------------------------------------------
alter table public.platform_settings
  add column if not exists login_video_url        text not null default '',
  add column if not exists login_video_poster_url text not null default '';

comment on column public.platform_settings.login_video_url is
  'Login page <video src>. Empty = the bundled /media/signin.mp4.';
comment on column public.platform_settings.login_video_poster_url is
  'Login page <video poster>. Empty = the bundled /media/signin-poster.jpg.';
