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
      video: video || DEFAULT_LOGIN_VIDEO,
      poster: poster || DEFAULT_LOGIN_POSTER,
    };
  } catch {
    // A settings read must never take the login page down. If the table is
    // missing (a database that has not run sql/0047 yet) the bundled video
    // is still the correct thing to show.
    return { video: DEFAULT_LOGIN_VIDEO, poster: DEFAULT_LOGIN_POSTER };
  }
}
