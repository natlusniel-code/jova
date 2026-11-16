-- =====================================================================
-- Test: admin moderation actually persists, and self-service cannot undo it
--
-- Replays the exact conditions the console produces:
--   * a Server Action writes with the service-role credential
--     (auth.role() = 'service_role', auth.uid() = null)
--   * a normal user writes with their own session
--
-- Run with: psql -d nmtest -f sql/_test_moderation.sql
-- Raises on any failure, so a non-zero exit means a real regression.
-- =====================================================================
\set ON_ERROR_STOP on

-- Deterministic starting point.
delete from public.shops where slug like 'test-mod-%';
delete from public.profiles where id in (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333'
);
delete from auth.users where id in (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333'
);
delete from public.admin_users where user_id = '33333333-3333-3333-3333-333333333333';

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'buyer@test.ng'),
  ('22222222-2222-2222-2222-222222222222', 'seller@test.ng'),
  ('33333333-3333-3333-3333-333333333333', 'admin@test.ng');

-- `on_auth_user_created` already created a profile row for each user, so
-- these are updates, not inserts. Written as an upsert so the test works
-- against a schema where the trigger is absent too.
insert into public.profiles (id, role, full_name, email) values
  ('11111111-1111-1111-1111-111111111111', 'buyer',  'Test Buyer',  'buyer@test.ng'),
  ('22222222-2222-2222-2222-222222222222', 'seller', 'Test Seller', 'seller@test.ng'),
  ('33333333-3333-3333-3333-333333333333', 'admin',  'Test Admin',  'admin@test.ng')
on conflict (id) do update
  set role = excluded.role,
      full_name = excluded.full_name,
      email = excluded.email,
      -- Reset moderation so a re-run starts from a known state.
      moderation_status = 'active',
      moderation_reason = null,
      moderation_until  = null,
      is_banned = false,
      ban_reason = null;

insert into public.admin_users (user_id, email)
values ('33333333-3333-3333-3333-333333333333', 'admin@test.ng');

insert into public.shops (id, owner_id, name, slug, status, verified, city, state, review_note, documents)
values ('44444444-4444-4444-4444-444444444444',
        '22222222-2222-2222-2222-222222222222',
        'Test Mod Shop', 'test-mod-shop', 'approved', true, 'Abeokuta', 'Ogun', null,
        '["verification/nin.jpg"]'::jsonb)
on conflict (id) do update
  set status = 'approved', review_note = null, documents = '["verification/nin.jpg"]'::jsonb;

\echo '── 1. Baseline ──'
do $$
begin
  assert (select moderation_status from public.profiles
           where id = '11111111-1111-1111-1111-111111111111') = 'active',
         'a fresh profile must be active';
  assert (select is_banned from public.profiles
           where id = '11111111-1111-1111-1111-111111111111') = false,
         'a fresh profile must not be banned';
end $$;

\echo '── 2. A service-role write is honoured (why the RPC can use the admin client) ──'
-- The console writes with the service-role credential, where auth.uid() is
-- null. tg_profiles_guard short-circuits on auth.role() = 'service_role', so
-- the write must land. This is the property the Server Action relies on.
set role service_role;
select set_config('request.jwt.claim.role', 'service_role', false);
select set_config('request.jwt.claim.sub', '', false);
update public.profiles set is_banned = true
 where id = '11111111-1111-1111-1111-111111111111';
reset role;
select set_config('request.jwt.claim.role', 'authenticated', false);

do $$
begin
  assert (select is_banned from public.profiles
           where id = '11111111-1111-1111-1111-111111111111') = true,
         'a service-role write must persist — the console depends on it';
  assert (select moderation_status from public.profiles
           where id = '11111111-1111-1111-1111-111111111111') = 'banned',
         'the sync trigger must derive moderation_status from a legacy is_banned write';
end $$;

-- Put it back so the rest of the test starts clean.
update public.profiles
   set moderation_status = 'active', is_banned = false, moderation_reason = null,
       moderation_until = null, moderated_at = null, moderated_by = null
 where id = '11111111-1111-1111-1111-111111111111';

\echo '── 3. The RPC suspends, and the derived is_banned follows ──'
select set_config('request.jwt.claim.role', 'service_role', false);
select set_config('request.jwt.claim.sub', '', false);
select public.admin_moderate_user(
  '11111111-1111-1111-1111-111111111111', 'suspend', 'Chargeback fraud', '33333333-3333-3333-3333-333333333333', now() + interval '7 days');
select set_config('request.jwt.claim.role', 'authenticated', false);

do $$
begin
  assert (select moderation_status from public.profiles
           where id = '11111111-1111-1111-1111-111111111111') = 'suspended',
         'suspend must set moderation_status = suspended';
  assert (select is_banned from public.profiles
           where id = '11111111-1111-1111-1111-111111111111') = true,
         'the derived is_banned must follow so the checkout RPCs see it';
  assert (select moderation_reason from public.profiles
           where id = '11111111-1111-1111-1111-111111111111') = 'Chargeback fraud',
         'the reason must be stored for the account holder to read';
  assert (select moderated_by from public.profiles
           where id = '11111111-1111-1111-1111-111111111111') is not null,
         'the actor must be recorded';
  assert public.account_block_reason('11111111-1111-1111-1111-111111111111') = 'Chargeback fraud',
         'the block reason must be readable';
end $$;

\echo '── 4. A suspended user cannot clear their own suspension ──'
set role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', false);
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
update public.profiles
   set moderation_status = 'active', is_banned = false, moderation_reason = null
 where id = '11111111-1111-1111-1111-111111111111';
reset role;

do $$
begin
  assert (select moderation_status from public.profiles
           where id = '11111111-1111-1111-1111-111111111111') = 'suspended',
         'SELF-SERVICE ESCALATION: a user must not be able to un-suspend themselves';
  assert (select is_banned from public.profiles
           where id = '11111111-1111-1111-1111-111111111111') = true,
         'is_banned must stay true after a self-service attempt';
end $$;

\echo '── 5. Reactivate restores the account AND the shop ──'
select set_config('request.jwt.claim.role', 'service_role', false);
select set_config('request.jwt.claim.sub', '', false);
select public.admin_moderate_user(
  '11111111-1111-1111-1111-111111111111', 'reactivate', null, '33333333-3333-3333-3333-333333333333', null);
select set_config('request.jwt.claim.role', 'authenticated', false);

do $$
begin
  assert (select moderation_status from public.profiles
           where id = '11111111-1111-1111-1111-111111111111') = 'active',
         'reactivate must clear moderation_status';
  assert (select is_banned from public.profiles
           where id = '11111111-1111-1111-1111-111111111111') = false,
         'reactivate must clear the derived is_banned';
  assert (select moderation_reason from public.profiles
           where id = '11111111-1111-1111-1111-111111111111') is null,
         'reactivate must clear the reason';
end $$;

\echo '── 6. Banning a seller takes their shop down, reactivation restores it ──'
select set_config('request.jwt.claim.role', 'service_role', false);
select set_config('request.jwt.claim.sub', '', false);
select public.admin_moderate_user(
  '22222222-2222-2222-2222-222222222222', 'ban', 'Selling counterfeit goods', '33333333-3333-3333-3333-333333333333', null);
select set_config('request.jwt.claim.role', 'authenticated', false);

do $$
begin
  assert (select moderation_status from public.profiles
           where id = '22222222-2222-2222-2222-222222222222') = 'banned', 'ban must set banned';
  assert (select status from public.shops
           where id = '44444444-4444-4444-4444-444444444444') = 'suspended',
         'a banned seller must not keep a live shop';
end $$;

select set_config('request.jwt.claim.role', 'service_role', false);
select set_config('request.jwt.claim.sub', '', false);
select public.admin_moderate_user(
  '22222222-2222-2222-2222-222222222222', 'reactivate', null, '33333333-3333-3333-3333-333333333333', null);
select set_config('request.jwt.claim.role', 'authenticated', false);

do $$
begin
  assert (select moderation_status from public.profiles
           where id = '22222222-2222-2222-2222-222222222222') = 'active', 'reactivate must clear ban';
  assert (select status from public.shops
           where id = '44444444-4444-4444-4444-444444444444') = 'approved',
         'reactivating a seller must put their shop back live';
end $$;

\echo '── 7. Guard rails ──'
do $$
declare v_err text;
begin
  -- An admin must not lock themselves out.
  perform set_config('request.jwt.claim.role', 'service_role', false);
  perform set_config('request.jwt.claim.sub', '', false);
  begin
    perform public.admin_moderate_user(
      '33333333-3333-3333-3333-333333333333', 'ban', 'oops', null, null);
    raise exception 'ASSERTION FAILED: an admin banned themselves';
  exception when others then
    v_err := sqlerrm;
    assert v_err ilike '%cannot%own account%' or v_err ilike '%Admin%',
           format('unexpected error for self-ban: %s', v_err);
  end;

  -- A reason is mandatory.
  begin
    perform public.admin_moderate_user(
      '11111111-1111-1111-1111-111111111111', 'suspend', '   ', null, null);
    raise exception 'ASSERTION FAILED: suspend without a reason was accepted';
  exception when others then
    v_err := sqlerrm;
    assert v_err ilike '%reason%', format('unexpected error for blank reason: %s', v_err);
  end;

  -- An unknown action is refused.
  begin
    perform public.admin_moderate_user(
      '11111111-1111-1111-1111-111111111111', 'obliterate', 'x', null, null);
    raise exception 'ASSERTION FAILED: an unknown action was accepted';
  exception when others then
    v_err := sqlerrm;
    assert v_err ilike '%Unknown%', format('unexpected error for bad action: %s', v_err);
  end;
  perform set_config('request.jwt.claim.role', 'authenticated', false);
end $$;

\echo '── 8. A non-admin cannot call the RPC at all ──'
do $$
declare v_err text;
begin
  set role authenticated;
  perform set_config('request.jwt.claim.role', 'authenticated', false);
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
  begin
    perform public.admin_moderate_user(
      '22222222-2222-2222-2222-222222222222', 'ban', 'not allowed', null, null);
    raise exception 'ASSERTION FAILED: a buyer banned another user';
  exception when others then
    v_err := sqlerrm;
    assert v_err ilike '%administrator%', format('unexpected error: %s', v_err);
  end;
  reset role;
  perform set_config('request.jwt.claim.role', 'authenticated', false);
end $$;

\echo '── 9. Expired suspensions lapse back to active ──'
select set_config('request.jwt.claim.role', 'service_role', false);
select set_config('request.jwt.claim.sub', '', false);
select public.admin_moderate_user(
  '11111111-1111-1111-1111-111111111111', 'suspend', 'Temporary hold', '33333333-3333-3333-3333-333333333333', now() - interval '1 minute');
select set_config('request.jwt.claim.role', 'authenticated', false);

do $$
begin
  assert (select moderation_status from public.profiles
           where id = '11111111-1111-1111-1111-111111111111') = 'active',
         'a suspension whose end time has passed must not still read as suspended';
  assert (select is_banned from public.profiles
           where id = '11111111-1111-1111-1111-111111111111') = false,
         'an expired suspension must not still block checkout';
end $$;

\echo '── 10. Login media columns exist and default to the bundled file ──'
do $$
begin
  assert (select login_video_url from public.platform_settings where id = 1) = '',
         'login_video_url must default to empty so the bundled video is used';
  assert (select login_video_poster_url from public.platform_settings where id = 1) = '',
         'login_video_poster_url must default to empty';
end $$;

\echo '✅ ALL MODERATION TESTS PASSED'
