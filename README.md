# Jova Marketplace

A Nigerian marketplace for goods and services. Buyers pay into escrow and the
money is released to the seller only when the buyer accepts delivery.

Built with Next.js 15 (App Router), TypeScript, Tailwind and Supabase.

Authentication is **Firebase** (Google, Apple, LinkedIn and email + password).
The marketplace itself still runs on Supabase; see
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
  dispatcher, and the Firebase→Supabase bridge; never expose it to the browser.
- `NEXT_PUBLIC_FIREBASE_*` — the public Firebase web config. Without it the
  app still builds and runs, but the auth pages say "sign-in is not
  configured" instead of offering a form.
- `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` —
  server-only Firebase Admin credentials, used to verify ID tokens. Required
  for any sign-in to work.
- `NEXT_PUBLIC_SITE_URL` — the canonical origin. This is what makes the Open
  Graph image resolve to an absolute URL, so a wrong value here means share
  previews break even though the site works. It is also the origin that must
  be listed in Firebase's Authorized domains for OAuth to return.

---

## Authentication

Firebase is the identity provider. Supabase is still the application database
and still issues the session cookie every page reads. There is no Clerk in this
app: the `@clerk/nextjs` dependency and every Clerk route were removed.

### How a sign-in works

1. The person picks a method on `/auth` (login) or `/signup` (create account):
   Google, Apple, LinkedIn, or email + password.
2. Firebase completes the flow in the browser and returns a **Firebase user**
   with a signed ID token. For OAuth, `signInWithRedirect` returns to `/auth`
   itself, where `getRedirectResult()` finishes the handshake — there is no
   separate callback route.
3. The browser calls `bridgeFirebaseSession` (`src/app/auth/firebase-actions.ts`
   → `src/lib/firebase/bridge.ts`) with that ID token. The action verifies the
   token **on the server** with the Firebase Admin SDK, finds or creates the
   matching Supabase user **by verified email**, and mints a **Supabase**
   session cookie.
4. The bridge confirms the session exists before returning, then the browser
   does a full document navigation (`window.location.assign`) so the next
   request reads the new cookie. From there the marketplace behaves exactly as
   before — same cookies, same RLS policies, same role routing.

The bridge is the only place a Jova session can start, and it is why the app
did not need rewriting when the provider changed.

### Existing Appwrite users

Every account created before this migration signed up through Appwrite with
Google. Those people have a Supabase row keyed on their Google email and no
Firebase identity at all. They are not locked out: signing in with the same
Google account produces a verified email, and the bridge matches them to their
**existing** Supabase account by that email, so their profile, role, orders and
chats are all intact. A verified email that already belongs to an account is
never used to create a second one.

### Firebase console setup (one-time)

These are dashboard steps, not environment variables:

| Where | What |
| --- | --- |
| Authentication → Sign-in method | Enable Google, Apple, LinkedIn and Email/Password |
| Authentication → Settings → Authorized domains | Add the production domain and every preview domain you sign in from |
| Authentication → Templates | Set the sender name to **Jova** and write the verification / reset messages |
| Authentication → Templates → SMTP settings | Optional, needs a plan: send from `no-reply@naijamart.ng` instead of Firebase's shared sender |

### Where the code lives

| File | Role |
| --- | --- |
| `src/lib/firebase/client.ts` | Browser SDK init (public config) |
| `src/lib/firebase/admin.ts` | Server-only Admin SDK, used to verify ID tokens |
| `src/lib/firebase/bridge.ts` | Firebase identity → Supabase user (find or create by verified email) |
| `src/app/auth/firebase-actions.ts` | The server action that mints the Supabase session, and sign-out |
| `src/components/firebase-auth-panel.tsx` | The auth UI — providers, password, redirect result |
| `src/app/auth/page.tsx` | Login page; redirects an already-signed-in person to their destination |
| `src/app/auth/continue/page.tsx` | Legacy entry point, now a redirect to `/auth` |
| `src/middleware.ts` | Supabase session refresh + admin gate |

### SDK versions

`firebase` **12.5.0**, `firebase-admin` **13.5.0** and `next` **15.5.29**, all
pinned exactly.

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
