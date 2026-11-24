# Jova Marketplace

A Nigerian marketplace for goods and services. Buyers pay into escrow and the
money is released to the seller only when the buyer accepts delivery.

Built with Next.js 15 (App Router), TypeScript, Tailwind and Supabase.

Authentication is **plain email + password**, verified by Supabase against the
account's existing credential. See [Authentication](#authentication) for the
two-step sign-in and why the password is checked by the database, not by
`signInWithPassword`.

---

## Running it locally

```bash
npm install
cp .env.local.example .env.local   # then fill in the values
npm run dev                        # http://localhost:3000
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Development server with hot reload |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint via `next lint` |
| `npm test` | LGA data check |

### Environment

`.env.local.example` lists every variable. The ones the app cannot start
without:

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — the public
  Supabase project.
- `SUPABASE_SERVICE_ROLE_KEY` — server-only. Used by admin actions, the push
  dispatcher, and the sign-in path (to call `nm_login` and mint the session);
  never expose it to the browser.
- `NEXT_PUBLIC_SITE_URL` — the canonical origin. This is what makes the Open
  Graph image resolve to an absolute URL, so a wrong value here means share
  previews break even though the site works.

---

## Authentication

Plain email + password. Supabase holds both the users and the session cookie
every page reads. There is no Firebase and no Clerk in this app: both SDKs, all
their routes, and every provider env var were removed on this branch.

### How a sign-in works

1. The person enters an email and a password on `/auth` (login) or `/signup`
   (create account).
2. The form calls a **Server Action** (`src/app/auth/actions.ts`), not the
   browser Supabase client.
3. The action checks the password with `nm_login(email, password)`
   (`sql/0015_local_auth.sql`). That function compares the bcrypt hash in
   `public.account_credentials`, enforces the lockout counter, and returns the
   user id and role. It is `EXECUTE`-revoked from `anon`/`authenticated`, so it
   can only be called server-side with the service-role key — it is not a
   password oracle.
4. The action mints a **Supabase session** for that same user id
   (`mintSession`: admin `generateLink` → `verifyOtp`), which writes the
   `sb-…-auth-token` cookies onto the action's own response.
5. The action re-reads `getUser()` and refuses to redirect unless the session is
   readable AND belongs to the same user id whose password was checked. A
   failure is shown on the form; it never bounces the person back to `/auth`.
6. The browser navigates to the role-based destination and refreshes.

### Why not `supabase.auth.signInWithPassword`?

Because it rejects passwords the user actually has. Measured on the live
project with a real account: `bcrypt.compare` of the user's password against
`auth.users.encrypted_password` is **false**, while the same comparison against
`account_credentials.password_hash` is **true**. Jova's accounts were created by
the local-credentials flow, so `encrypted_password` holds a random Supabase-minted
hash the user has never known. The credential table is the real password store.

### Destinations after auth

- buyer → storefront `/`
- buyer who still needs a phone + LGA → `/signup/complete`
- seller with a shop → the onboarding step they are on, or `/seller` once approved
- seller with no shop → `/seller/onboarding?step=1`
- admin → the admin console
- an explicit, safe `?next=` always wins (`src/lib/safe-next.ts`)

### Supabase dashboard settings

| Setting | Value |
| --- | --- |
| Authentication → Providers → Email | Enabled (this is the only provider in use) |
| Authentication → Settings | Email confirmation may stay off; the app creates accounts already confirmed |
| SQL editor | `sql/0015_local_auth.sql` must be applied — `nm_login` / `nm_set_password` are the password store |

### Where the code lives

| File | Role |
| --- | --- |
| `src/lib/auth/password.ts` | The sign-in and sign-up logic: `nm_login` check → `mintSession` → destination |
| `src/app/auth/actions.ts` | Server actions the forms call (`signInAction`, `signUpAction`, `completeProfileAction`, `signOutAction`) |
| `src/lib/auth/local.ts` | `mintSession` (verified identity → Supabase session) and `requestClient` |
| `src/lib/auth/landing.ts` | Role-based destination for an already-signed-in visitor |
| `src/lib/post-auth.ts` | Role-based destination after a sign-in or sign-up |
| `src/lib/safe-next.ts` | The one place that validates `?next=` |
| `src/components/signin-form.tsx` | Sign-in form |
| `src/components/signup-form.tsx` | Sign-up form (role, name, email, password) |
| `src/app/auth/page.tsx` | Login page; redirects an already-signed-in person to their destination |
| `src/app/signup/page.tsx` | Registration page |
| `src/app/signup/complete/page.tsx` | Buyer's phone + LGA step |
| `src/middleware.ts` | Supabase session refresh + admin gate |

### SDK versions

`next` **15.5.29** is pinned exactly. There is no auth SDK dependency: sign-in
goes through Supabase over HTTP, so there is no client SDK to drift.

Two consequences worth knowing before editing:

- **Route params and search params are Promises.** Every page reads them as
  `const params = await paramsPromise`. Adding a new page means awaiting them
  too, or the build fails its type check.
- **`createClient()` in `src/lib/supabase/server.ts` stays synchronous.** The
  `await cookies()` lives inside the `@supabase/ssr` cookie adapter, which is
  allowed to be async, so the ~130 call sites did not have to change.

### Database

The schema lives in `sql/`, applied in numeric order. Each file is idempotent
and safe to re-run.

```bash
psql "$DATABASE_URL" -f sql/0001_init.sql
# ... in order, up to the highest number
```

---

## Brand assets

Everything visual is generated from one source: the Jova logo (the cart with
the star inside it). The files in `public/` are derived from it, not drawn
separately, so the mark cannot drift between the header, the tab, the home
screen and the notification shade.

| File | Used for |
| --- | --- |
| `jova-logo.png` | The full lockup (mark + wordmark) on light surfaces |
| `jova-logo-white.png` | The same lockup, white, for the dark auth panel |
| `jova-mark.png` | The mark alone — mobile header, compact slots |
| `jova-mark-star.png` | The star alone — the global loader |
| `favicon.ico` | Browser tab (16–256px, multi-resolution) |
| `icon-192.png`, `icon-512.png` | PWA / Android home screen |
| `icon-maskable-192.png`, `icon-maskable-512.png` | Android adaptive icon |
| `apple-touch-icon.png` | iOS home screen |
| `notification-icon-192.png` | Large notification icon (plate, reads on light and dark) |
| `notification-icon-white.png` | Status-bar silhouette for a dark shade |
| `notification-icon-black.png` | Status-bar silhouette for a light shade |
| `og-image.jpg` | Open Graph / Twitter share card, 1200×630 |
| `media/signin.mp4` | The login page video |
| `media/signin-poster.jpg` | Its poster frame |

### The loader

`src/components/global-loader.tsx` draws a single star turning on its own
axis, with **no background** — no scrim, no plate, no white wash. The page
underneath stays fully visible. It is mounted once in the root layout, so
every route gets it.

It is deliberately **not** shown while a chat message is being sent: the
composer has its own in-bubble pending state, and a star over the thread on
every send reads as the chat reloading. See `withLoaderMuted()` in
`src/lib/global-loader.ts`.

### Notifications

A notification is drawn by the operating system, which picks the background.
One fixed icon therefore cannot be visible in both light and dark mode, so
there are two slots:

- **Large icon** — the full-colour mark on a white plate. Readable on a light
  and on a dark shade.
- **Badge** — a solid monochrome silhouette. Android keeps only its alpha
  channel, so a full-colour image here renders as a blank blob. The client
  picks white or black from `prefers-color-scheme`; see
  `src/lib/notification-icons.ts`.

---

## Project layout

```
src/
  app/            routes (App Router)
    (shop)/       storefront
    seller/       seller hub
    admin-*/      admin console
  components/     UI, including the global loader
  lib/            domain logic, Supabase clients, brand helpers
public/           brand assets, service worker, login media
sql/              schema, applied in numeric order
```

---

## Notes

- **Storage bucket.** Uploads go to the Supabase bucket named `naijamart`.
  The name is a service identifier, not brand copy: renaming it in code
  without renaming the bucket would break every existing image URL. It is
  left as-is on purpose.
- **Login video.** `platform_settings.login_video_url` can override the
  bundled video, but only with a direct media URL. A Google Drive *view* page
  or a YouTube watch page is HTML, not video, and is rejected — see
  `isPlayableVideoUrl()` in `src/lib/login-media.ts`.
