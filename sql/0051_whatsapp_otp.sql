-- Jova WhatsApp OTP challenges.
-- Apply once in Supabase SQL Editor before enabling WhatsApp sign-in.
create table if not exists public.whatsapp_otp_challenges (
  phone text primary key,
  purpose text not null check (purpose in ('signup', 'login')),
  user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null,
  attempts integer not null default 0,
  expires_at timestamptz not null,
  sent_at timestamptz not null default now(),
  window_started_at timestamptz not null default now(),
  send_count integer not null default 1,
  created_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists phone_verified_at timestamptz;

alter table public.whatsapp_otp_challenges enable row level security;
revoke all on public.whatsapp_otp_challenges from public, anon, authenticated;

create or replace function public.nm_issue_whatsapp_otp(
  p_phone text,
  p_purpose text,
  p_user_id uuid,
  p_code_hash text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_phone text;
  v_row public.whatsapp_otp_challenges%rowtype;
begin
  insert into public.whatsapp_otp_challenges
    (phone, purpose, user_id, code_hash, attempts, expires_at, sent_at, window_started_at, send_count)
  values
    (p_phone, p_purpose, p_user_id, p_code_hash, 0, now() + interval '5 minutes', now(), now(), 1)
  on conflict (phone) do update set
    purpose = excluded.purpose,
    user_id = excluded.user_id,
    code_hash = excluded.code_hash,
    attempts = 0,
    expires_at = now() + interval '5 minutes',
    sent_at = now(),
    window_started_at = case
      when public.whatsapp_otp_challenges.window_started_at < now() - interval '1 hour' then now()
      else public.whatsapp_otp_challenges.window_started_at
    end,
    send_count = case
      when public.whatsapp_otp_challenges.window_started_at < now() - interval '1 hour' then 1
      else public.whatsapp_otp_challenges.send_count + 1
    end
  where public.whatsapp_otp_challenges.sent_at <= now() - interval '60 seconds'
    and (
      public.whatsapp_otp_challenges.window_started_at < now() - interval '1 hour'
      or public.whatsapp_otp_challenges.send_count < 5
    )
  returning phone into v_phone;

  if v_phone is not null then
    return jsonb_build_object('ok', true);
  end if;

  select * into v_row from public.whatsapp_otp_challenges where phone = p_phone;
  if not found then return jsonb_build_object('ok', false, 'reason', 'unavailable'); end if;
  if v_row.sent_at > now() - interval '60 seconds' then
    return jsonb_build_object('ok', false, 'reason', 'cooldown', 'retry_after', greatest(1, ceil(extract(epoch from (v_row.sent_at + interval '60 seconds' - now())))::int));
  end if;
  return jsonb_build_object('ok', false, 'reason', 'hourly_limit');
end $$;

create or replace function public.nm_verify_whatsapp_otp(
  p_phone text,
  p_code_hash text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_row public.whatsapp_otp_challenges%rowtype;
begin
  select * into v_row from public.whatsapp_otp_challenges
   where phone = p_phone for update;

  if not found then return jsonb_build_object('ok', false, 'reason', 'no_code'); end if;
  if v_row.expires_at < now() then
    delete from public.whatsapp_otp_challenges where phone = p_phone;
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  if v_row.attempts >= 5 then
    delete from public.whatsapp_otp_challenges where phone = p_phone;
    return jsonb_build_object('ok', false, 'reason', 'locked');
  end if;
  if v_row.code_hash <> p_code_hash then
    update public.whatsapp_otp_challenges set attempts = attempts + 1 where phone = p_phone;
    return jsonb_build_object('ok', false, 'reason', 'mismatch', 'attempts_left', 4 - v_row.attempts);
  end if;

  delete from public.whatsapp_otp_challenges where phone = p_phone;
  return jsonb_build_object('ok', true, 'purpose', v_row.purpose, 'user_id', v_row.user_id);
end $$;

revoke all on function public.nm_issue_whatsapp_otp(text, text, uuid, text) from public, anon, authenticated;
revoke all on function public.nm_verify_whatsapp_otp(text, text) from public, anon, authenticated;
grant execute on function public.nm_issue_whatsapp_otp(text, text, uuid, text) to service_role;
grant execute on function public.nm_verify_whatsapp_otp(text, text) to service_role;
