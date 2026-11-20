# Jova Marketplace

A Nigerian marketplace for goods and services. Buyers pay into escrow and the
money is released to the seller only when the buyer accepts delivery.

Built with Next.js 15 (App Router), TypeScript, Tailwind and Supabase.

Authentication is **Clerk** (Google, Apple, LinkedIn and email — password or
one-time code). The marketplace itself still runs on Supabase; see
[Authentication](#authentication) for how the two fit together.

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
  dispatcher, and the Clerk→Supabase bridge; never expose it to the browser.
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — the public Clerk key. Without it the
  app still builds and runs, but the auth pages say "sign-in is not
  configured" instead of offering a form.
- `CLERK_SECRET_KEY` — server-only. Read by `@clerk/nextjs` itself (not by our
  code) to verify sessions. Required for any sign-in to work.
- `NEXT_PUBLIC_SITE_URL` — the canonical origin. This is what makes the Open
  Graph image resolve to an absolute URL, so a wrong value here means share
  previews break even though the site works. It is also the origin Clerk
  returns OAuth callbacks to.

---

## Authentication

Clerk is the identity provider. Supabase is still the application database and
still issues the session cookie every page reads.

### How a sign-in works

1. The person picks a method on `/auth` (login) or `/signup` (create account):
   Google, Apple, LinkedIn, or email with a password or a one-time code.
2. Clerk completes the flow and the browser holds a **Clerk** session.
3. The browser calls `bridgeClerkSession` (`src/app/auth/clerk-actions.ts`).
   That action reads the identity from the Clerk session **on the server**,
   finds or creates the matching Supabase user **by email**, and mints a
   **Supabase** session cookie.
4. From there the marketplace behaves exactly as before — same cookies, same
   RLS policies, same role routing.

The bridge is the only place a Jova session can start, and it is why the app
did not need rewriting when the provider changed.

### Existing Appwrite users

Every account created before this migration signed up through Appwrite with
Google. Those people have a Supabase row keyed on their Google email and no
Clerk identity at all. They are not locked out:

- **Google / Apple / LinkedIn** — Clerk automatically transfers an OAuth
  sign-in with no matching Clerk account into a sign-up, so the first attempt
  creates their Clerk identity and signs them in.
- **Email** — the login page tries `signIn` first; when Clerk answers
  `form_identifier_not_found` it creates the identity and emails a code.

Either way the bridge then matches them to their **existing** Supabase account
by email, so their profile, role, orders and chats are all intact. They can set
a password afterwards from the sign-up page if they want one.

### Clerk dashboard setup (one-time)

These are dashboard steps, not environment variables:

| Where | What |
| --- | --- |
| Configure → Paths | Sign-in URL `/auth`, Sign-up URL `/signup`, After sign-out `/auth` |
| Configure → SSO connections | Enable Google, Apple, LinkedIn (OIDC) |
| Configure → Email | Enable **email code**; enable **password** if you want email + password |
| Customization → Emails | Set the sender name to **Jova** and write the code message (e.g. `Your Jova sign-in code is {{otp_code}}`) |
| Customization → Emails → Custom domain | Optional, needs a paid plan: send from `no-reply@naijamart.ng` instead of Clerk's shared sender |
| Each SSO provider | Allowed redirect URL `<NEXT_PUBLIC_SITE_URL>/auth/sso-callback` (plus `http://localhost:3000/auth/sso-callback` for local dev) |

The custom sender name and message are free on the development instance. The
custom sending domain requires a paid Clerk plan and DNS records on that
domain; until it is set up, codes come from Clerk's own verified sender.

### Where the code lives

| File | Role |
| --- | --- |
| `src/lib/clerk/config.ts` | Publishable key, canonical origin, the provider list |
| `src/lib/clerk/appearance.ts` | Clerk's own UI dressed in Jova's theme |
| `src/lib/clerk/bridge.ts` | Clerk identity → Supabase user (find or create by email) |
| `src/app/auth/clerk-actions.ts` | The server action that mints the Supabase session |
| `src/components/clerk-auth-panel.tsx` | The auth UI — providers, password, code |
| `src/app/auth/sso-callback/page.tsx` | OAuth handshake return |
| `src/app/auth/continue/page.tsx` | Mints the session after an OAuth round trip |
| `src/middleware.ts` | `clerkMiddleware` wrapping the Supabase refresh + admin gate |

### SDK versions

`@clerk/nextjs` **7.10.6** and `next` **15.5.29**, both pinned exactly.

Clerk 7 is the version that matches the Clerk instance. Older SDKs are refused
by the instance at sign-in time with *"This app uses an outdated version of
Clerk"*, so this pair must not be downgraded independently: Clerk 7 requires
Next 15.2.8 or newer, and Next 15 is what made `cookies()`, `headers()`,
`params` and `searchParams` asynchronous.

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
