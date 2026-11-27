# Jova Marketplace

A Nigerian marketplace for goods and services. Buyers pay into escrow and the
money is released to the seller only when the buyer accepts delivery.

Built with Next.js 15 (App Router), TypeScript, Tailwind and Supabase.

Authentication is **Clerk** (identity) bridged to **Supabase** (data). Clerk
verifies the credential and holds the session cookie; a server-side bridge mints
the Supabase session that every RLS policy reads `auth.uid()` from. See
[Authentication](#authentication).

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
  dispatcher, and the auth bridge (to resolve/create the Supabase user and mint
  the session); never expose it to the browser.
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` — Clerk's keys. The
  publishable key is public by design; the secret key is server-only.
- `NEXT_PUBLIC_SITE_URL` — the canonical origin. This is what makes the Open
  Graph image resolve to an absolute URL, so a wrong value here means share
  previews break even though the site works.

---

## Authentication

**Clerk is the identity provider. Supabase is the data authority.** They are
joined by one file, `src/lib/clerk/bridge.ts`, and that is the only place a
session is established.

### Why two systems

Clerk owns the credential check, MFA, social connections and the session cookie.
But every table in this project is protected by RLS keyed on `auth.uid()`, and
`auth.uid()` is a **Supabase** user id — Clerk's `user_…` id means nothing to
Postgres. So a Clerk sign-in is not finished when Clerk says it is; it is
finished when the person also holds a Supabase session whose `auth.uid()` is the
id their `profiles` row, `shops` row, orders and payouts already point at.

### How a sign-in works

1. The person signs in on `/auth` (login) or `/signup` (create account) using
   Clerk's own component. Clerk verifies the credential and writes its session
   cookie.
2. The form calls a **Server Action** (`src/app/auth/actions.ts`), which calls
   `bridgeClerkSession`.
3. The bridge reads the Clerk identity (`auth()` + `clerkClient().users.getUser`)
   and takes the primary email.
4. It resolves the ONE Supabase user that owns that email, or creates it on
   sign-up. An ambiguous email (two profiles) with no session id to disambiguate
   is **refused**, not guessed — guessing is how a seller lands in a buyer's
   account.
5. `mintSession(email)` (admin `generateLink` → `verifyOtp`) writes the
   `sb-…-auth-token` cookies onto the action's own response.
6. The bridge re-resolves against the id the session actually carries, so the
   app and the session can never disagree.
7. The browser navigates to the role-based destination and refreshes.

### Why the password is no longer checked by the database

`nm_login` / `public.account_credentials` were a second credential store. A
staff member or buyer had a Jova password that Clerk knew nothing about, so a
reset in one place left the other stale. Clerk is the only credential store now;
`nm_login` is no longer called by any sign-in path.

### Destinations after auth

- buyer → storefront `/`
- buyer who still needs a phone + LGA → `/signup/complete`
- seller with a shop → the onboarding step they are on, or `/seller` once approved
- seller with no shop → `/seller/onboarding?step=1`
- admin → the admin console
- an explicit, safe `?next=` always wins (`src/lib/safe-next.ts`)

### Clerk dashboard settings

| Setting | Value |
| --- | --- |
| API Keys | Copy the publishable + secret key into the env |
| User & Authentication → Email | Enabled (the only strategy in use) |
| Paths | Sign-in `/auth`, sign-up `/signup`, after sign-out `/` |

### Where the code lives

| File | Role |
| --- | --- |
| `src/lib/clerk/bridge.ts` | **The bridge.** Clerk identity → Supabase user → `mintSession` → destination |
| `src/app/auth/actions.ts` | Server actions the forms call (`signInAction`, `signUpAction`, `completeProfileAction`, `signOutAction`) |
| `src/lib/auth/local.ts` | `mintSession` (verified identity → Supabase session) and `requestClient` |
| `src/lib/auth/landing.ts` | Role-based destination for an already-signed-in visitor |
| `src/lib/post-auth.ts` | Role-based destination after a sign-in or sign-up |
| `src/lib/safe-next.ts` | The one place that validates `?next=` |
| `src/components/signin-form.tsx` | Clerk `<SignIn />` + bridge handoff |
| `src/components/signup/signup-details.tsx` | Clerk `<SignUp />` + bridge handoff (role carried from step one) |
| `src/app/auth/page.tsx` | Login page; redirects an already-signed-in person to their destination |
| `src/app/signup/page.tsx` | Registration step one (buyer or seller) |
| `src/app/signup/complete/page.tsx` | Buyer's phone + LGA step |
| `src/middleware.ts` | `clerkMiddleware` + Supabase session refresh + admin gate |

### SDK versions

`next` **15.5.29** is pinned exactly. `@clerk/nextjs` **^7.10.6** is the only
auth SDK.

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
