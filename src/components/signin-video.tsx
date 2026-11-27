"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The sign-in video.
 *
 * ── Why `muted` is set three ways ──────────────────────────────────────
 * The requirement is that the video is silent. `muted` as a JSX prop is not
 * enough on its own: React sets the property, but some mobile browsers decide
 * whether autoplay is allowed from the *attribute* at parse time, and a video
 * that is not muted is refused autoplay — which is exactly the "it just sits
 * on a black frame" bug. So the attribute is written in the markup, the
 * property is forced in an effect, and `volume` is pinned to 0.
 *
 * ── Why it is not a background video ───────────────────────────────────
 * A full-bleed video behind a login form is a performance trap: it competes
 * with the form for the main thread on a mid-range Android, and a 2.4 MB file
 * on a 3G connection means the buyer stares at a blank panel while it
 * downloads. So it is a contained panel with a poster frame, `preload="auto"`
 * only after mount, and `playsInline` so iOS does not hijack it into fullscreen.
 */
export function SignInVideo({
  src = "/media/signin.mp4",
  poster = "/media/signin-poster.jpg",
  compact = false,
}: {
  /**
   * Both default to the bundled files, so the component works with no
   * configuration. The admin dashboard can override them from
   * `platform_settings` (sql/0047) — see `getLoginMedia()` in
   * src/lib/login-media.ts. An empty string is treated as "use the
   * default", which is what the settings row stores before anyone edits it.
   */
  src?: string;
  poster?: string;
  /**
   * Shorter frame for the brand panel, where the video is a mood-setting
   * strip above the trust bullets rather than the main event. The form
   * column needs the vertical room more than the video does.
   */
  compact?: boolean;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [ready, setReady] = useState(false);

  // A changed URL must restart the fade-in, otherwise the new video appears
  // at opacity 0 and never becomes visible because `canplay` already fired
  // for the previous source.
  useEffect(() => {
    setReady(false);
  }, [src]);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.muted = true;
    v.volume = 0;
    v.defaultMuted = true;

    // Autoplay can still be refused (low-power mode, data saver). When it is,
    // the poster stays up — which is a still frame of the same video, not a
    // black box.
    const play = () => {
      const p = v.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    };
    if (v.readyState >= 2) play();
    v.addEventListener("canplay", play);
    return () => v.removeEventListener("canplay", play);
  }, []);

  return (
    <div
      className="relative overflow-hidden rounded-2xl bg-ink-900 bg-cover bg-center shadow-lift"
      style={{ backgroundImage: `url(${poster})` }}
    >
      {/* ── Why the poster is also a background layer ───────────────────
          The `poster` attribute only paints while the <video> element is
          itself visible. The element starts at `opacity-0` and only fades in
          on `canplay`, so on a device that cannot decode the file (an old
          Android, a browser without H.264, a blocked request) the poster was
          invisible too and the panel was a plain black box. Painting the
          poster on the container means the frame is always a still of the
          video, and the video simply fades in over it when it can play. */}
      <video
        ref={ref}
        className={`relative w-full object-cover transition-opacity duration-500 ${
          compact ? "h-[132px]" : "h-40 sm:h-48"
        } ${ready ? "opacity-100" : "opacity-0"}`}
        src={src}
        poster={poster}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        disablePictureInPicture
        controls={false}
        aria-hidden="true"
        tabIndex={-1}
        onCanPlay={() => setReady(true)}
      />
      {/* A soft scrim so the caption stays readable over any frame. */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink-900/80 via-ink-900/10 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3">
        <p className="text-[12.5px] font-bold text-white">Buy and hire from verified sellers.</p>
        <p className="mt-0.5 text-[11px] text-white/70">Escrow protected · Pay only when you accept.</p>
      </div>
    </div>
  );
}
