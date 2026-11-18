-- 0050 — clear the unplayable login video left over from the rebrand.
--
-- ── What went wrong ───────────────────────────────────────────────────
-- `platform_settings.login_video_url` was set to a Google Drive *share*
-- link (`https://drive.google.com/file/d/<id>/view`). That URL serves an
-- HTML page, not a video file, so the `<video>` element on /signin fetched
-- `text/html`, never fired `canplay`, and sat on its poster forever. The
-- login page looked like it was ignoring the configured video.
--
-- ── Why the fix is in the data and in the code ────────────────────────
-- The code now refuses to render an unplayable URL and falls back to the
-- bundled `/media/signin.mp4` (see `isPlayableVideoUrl` in
-- src/lib/login-media.ts), so the page is correct even before this runs.
-- This migration removes the bad value so the admin settings screen shows
-- the truth — an empty field meaning "use the bundled video" — instead of
-- a URL that looks configured but does nothing.
--
-- It is deliberately narrow: only Drive/Docs *view* links and YouTube watch
-- pages are cleared. A direct file URL an admin has set on purpose is left
-- exactly as it is.

update public.platform_settings
set login_video_url = ''
where id = 1
  and login_video_url <> ''
  and (
    login_video_url ~* '^https?://(www\.)?(drive|docs)\.google\.com/.*(/view|/edit)'
    or login_video_url ~* '^https?://(www\.)?(m\.)?(youtube\.com/watch|youtu\.be/)'
  );

comment on column public.platform_settings.login_video_url is
  'Optional override for the /signin video. Empty means the bundled /media/signin.mp4. Must be a direct media file URL — a Drive/Docs view page or a YouTube watch page is not playable and is ignored by the app.';
