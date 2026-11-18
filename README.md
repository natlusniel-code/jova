# Jova Marketplace

A Nigerian marketplace for goods and services. Buyers pay into escrow and the
money is released to the seller only when the buyer accepts delivery.

Built with Next.js 14 (App Router), TypeScript, Tailwind and Supabase.

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
- `SUPABASE_SERVICE_ROLE_KEY` — server-only. Used by admin actions and the
  push dispatcher; never expose it to the browser.
- `NEXT_PUBLIC_SITE_URL` — the canonical origin. This is what makes the Open
  Graph image resolve to an absolute URL, so a wrong value here means share
  previews break even though the site works.

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
