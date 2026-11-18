import { createClient } from "@/lib/supabase/server";

/**
 * The login page's video and poster, as configured by an admin.
 *
 * ── Why this is read on the server ────────────────────────────────────
 * `platform_settings` is publicly readable (`settings_read`), so this
 * needs no service key and no client-side fetch: the page renders with
 * the right `src` in the first HTML response, which means no flash of the
 * default video before the configured one appears.
 *
 * ── Why empty means "default" ─────────────────────────────────────────
 * The columns default to `''` (sql/0047). Treating that as "use the
 * bundled file" keeps a fresh install working before anyone uploads
 * anything, and gives the admin a way back to the default without having
 * to know the path. The defaults live here, in one place, so the
 * component and the settings form cannot disagree about them.
 */
export const DEFAULT_LOGIN_VIDEO = "/media/signin.mp4";
export const DEFAULT_LOGIN_POSTER = "/media/signin-poster.jpg";

/**
 * Is this URL something a `<video>` element can actually play?
 *
 * ── Why this check exists ─────────────────────────────────────────────
 * The admin field accepts any http(s) URL, and a Google Drive *share* link
 * (`drive.google.com/file/d/<id>/view`) is the URL people naturally paste.
 * It is an HTML page, not a media file: the browser fetches it, gets
 * `text/html`, and the video element sits on its poster forever with
 * `readyState: 0`. That is exactly what was happening on the login page —
 * the configured "video" was a Drive view link, so the new video never
 * appeared no matter what was deployed.
 *
 * A share link can be turned into a playable one, but only for files the
 * world can read, and guessing at that is worse than falling back: the
 * bundled video is always correct and always present. So an unplayable URL
 * is treated the same as an empty one.
 *
 * The check is deliberately narrow — it rejects the known-bad shapes
 * (Drive/Docs view links, YouTube watch pages) and accepts everything else,
 * because a false rejection only costs the admin their custom video while a
 * false acceptance leaves the login page with a dead player.
 */
export function isPlayableVideoUrl(url: string): boolean {
  if (!url) return false;
  let parsed: URL;
  try {
    parsed = new URL(url, "https://example.invalid");
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;

  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
  const path = parsed.pathname.toLowerCase();

  // A Drive/Docs "view" page is HTML. `/uc?export=download` and
  // `lh3.googleusercontent.com` are real files and are left alone.
  if (host === "drive.google.com" || host === "docs.google.com") {
    return path.includes("/uc") || path.includes("export=download");
  }
  // A YouTube watch/short page is HTML too; only a direct file is playable.
  if (host === "youtube.com" || host === "youtu.be" || host === "m.youtube.com") {
    return false;
  }
  // Any other page-shaped URL (a `.html`/`.htm` document) is not media.
  if (path.endsWith(".html") || path.endsWith(".htm")) return false;

  return true;
}

export type LoginMedia = { video: string; poster: string };

export async function getLoginMedia(): Promise<LoginMedia> {
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("platform_settings")
      .select("login_video_url,login_video_poster_url")
      .eq("id", 1)
      .maybeSingle();

    const video = (data?.login_video_url ?? "").trim();
    const poster = (data?.login_video_poster_url ?? "").trim();

    return {
      // An unplayable URL falls back to the bundled video rather than
      // rendering a dead player — see isPlayableVideoUrl above.
      video: isPlayableVideoUrl(video) ? video : DEFAULT_LOGIN_VIDEO,
      poster: poster || DEFAULT_LOGIN_POSTER,
    };
  } catch {
    // A settings read must never take the login page down. If the table is
    // missing (a database that has not run sql/0047 yet) the bundled video
    // is still the correct thing to show.
    return { video: DEFAULT_LOGIN_VIDEO, poster: DEFAULT_LOGIN_POSTER };
  }
}
