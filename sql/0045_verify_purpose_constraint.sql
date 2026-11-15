-- =====================================================================
-- NaijaMart — 0045 Allow the 'verify' purpose
-- =====================================================================
-- `one_time_codes_purpose_check` was written when the only purposes were
-- 'signup' and 'reset'. The email-link flow needs a third, 'verify', and the
-- constraint rejected every insert — so no verification link could ever be
-- issued.
--
-- Widened rather than dropped: the constraint is what stops a typo'd purpose
-- from silently creating a row nothing will ever read.

alter table public.one_time_codes
  drop constraint if exists one_time_codes_purpose_check;

alter table public.one_time_codes
  add constraint one_time_codes_purpose_check
  check (purpose in ('signup', 'reset', 'verify'));
