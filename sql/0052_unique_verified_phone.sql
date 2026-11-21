-- Only verified phone numbers must be unique. Legacy unverified profile phone values
-- are not trusted for WhatsApp authentication and may contain duplicates.
create unique index if not exists profiles_verified_phone_unique on public.profiles ((regexp_replace(phone, '[^0-9]', '', 'g'))) where phone is not null and phone_verified_at is not null;
