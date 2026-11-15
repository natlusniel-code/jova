# Security: secrets, rotation and the admin RPCs

This file documents the credential handling after the 2026-11 security pass.
It is the reference for README §1d.

## 1. No secret is committed any more

Four values used to live in the source tree and in git history. All four have
been removed from the working tree **and** purged from history:

| What | Where it used to be | Now read from |
|---|---|---|
| Supabase `service_role` JWT | `src/lib/supabase/admin.ts` (`FALLBACK_SERVICE_ROLE_KEY`) | `SUPABASE_SERVICE_ROLE_KEY` |
| Supabase `sb_secret_…` key | same constant, earlier revision (commit `cbf2852`) | `SUPABASE_SERVICE_ROLE_KEY` |
| VAPID **private** key | `src/lib/push-private.ts` (`FALLBACK_VAPID_PRIVATE_KEY`) | `VAPID_PRIVATE_KEY` |
| Jobs shared secret | `src/lib/jobs-secret.ts` | `JOBS_SECRET` |
| Old Gemini API key | `src/lib/ai-listing.ts` (split into `KEY_PART_1`/`KEY_PART_2`) | `GEMINI_API_KEY` |

There is **no fallback** for any of them. A missing variable fails loudly:

* `SUPABASE_SERVICE_ROLE_KEY` → `createAdminClient()` throws; the admin console
  renders its "not configured" banner / error boundary and every action returns
  an error.
* `VAPID_PRIVATE_KEY` / `NEXT_PUBLIC_VAPID_PUBLIC_KEY` → `pushConfigured()` is
  false and `dispatchPush()` reports "Web Push is not configured".
* `JOBS_SECRET` → `/api/jobs/run` answers `503` and does nothing.

Names and setup notes are in `.env.local.example`. Real values belong in the
deployment environment (Vercel → Project Settings → Environment Variables, for
Production **and** Preview) and in a gitignored `.env.local` for local work.

## 2. Rotate these — removing them from the repo does not kill them

Purging history stops *future* readers. It does not invalidate a value that was
already public. **Rotate all of these yourself:**

1. **Supabase → Project Settings → API Keys** — revoke the leaked
   `service_role` JWT and the `sb_secret_…` key, then create a new secret key
   and set it as `SUPABASE_SERVICE_ROLE_KEY`. Also check
   **Authentication → Users** and the database for anything created with the
   old key.
2. **Google Cloud console → APIs & Services → Credentials** — delete the old
   Gemini API key (the one that shipped in the client bundle as
   `NEXT_PUBLIC_GEMINI_KEY`), create a new one, restrict it to the Generative
   Language API, and set it as `GEMINI_API_KEY`.
3. **VAPID key pair** — wherever it was generated (`npx web-push
   generate-vapid-keys`, or your push provider's dashboard): generate a new
   pair, set `VAPID_PRIVATE_KEY` + `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, and delete
   the old pair. Existing subscriptions become invalid; devices re-subscribe on
   their next page load because `ensurePushSubscription()` runs on every
   signed-in page.
4. **`JOBS_SECRET`** — generate a new random value (`openssl rand -hex 32`),
   set it in the deployment, and update whatever external cron calls
   `/api/jobs/run`.

## 3. The admin console calls the database RPCs

`src/app/admin-fuckliving/actions.ts` used to re-implement the business rules of
`admin_verify_payment`, `admin_resolve_dispute`, `admin_mark_payout_paid`,
`admin_set_shop_status`, `admin_save_payment_account` and
`admin_delete_payment_account` in TypeScript, because those RPCs open with
`if not public.is_admin()` and a Server Action has no `auth.uid()`.

`sql/0043_admin_rpc_single_source_of_truth.sql` fixes the guard instead:
`is_admin()` also returns true for a caller authenticated as `service_role`
(PostgREST reads that role from the verified JWT, so a browser cannot forge it).
The actions now just call the RPCs, so the rules live in one place.

The RPCs take an optional `p_actor uuid` used **only** for audit columns
(`verified_by`, `resolved_by`). It is never used for authorisation.

Apply `sql/0043` to the database before deploying this code — the actions call
the new signatures.
