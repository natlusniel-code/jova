"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveLoginVideo } from "@/app/admin-fuckliving/actions";
import { Alert, Card, Spinner } from "@/components/ui";

/**
 * Edit the login page video from the admin dashboard.
 *
 * ── Why a URL field and not a file upload ─────────────────────────────
 * The video is served from the CDN, not from the app bundle, so the admin
 * pastes the URL of the file they have already uploaded. That keeps the
 * deploy out of the loop entirely: change the URL, save, and the login
 * page serves the new video on the next request.
 *
 * ── Why the preview is a real <video> ─────────────────────────────────
 * A URL that 404s or points at an HTML page looks fine in a text box and
 * breaks the login screen. The preview plays the actual source, so a bad
 * URL is visible here rather than on the page every signed-out visitor
 * sees. It is muted and `playsInline` for the same reason the login video
 * is — autoplay is refused otherwise.
 *
 * ── Why empty is offered explicitly ───────────────────────────────────
 * Clearing both fields restores the bundled video. That is a real action
 * an admin needs (a bad upload, a campaign that ended), so it is stated
 * rather than left as a puzzle about what an empty box does.
 */
export function LoginVideoEditor({
  initialVideo,
  initialPoster,
  defaultVideo,
  defaultPoster,
}: {
  initialVideo: string;
  initialPoster: string;
  defaultVideo: string;
  defaultPoster: string;
}) {
  const router = useRouter();
  const [video, setVideo] = useState(initialVideo);
  const [poster, setPoster] = useState(initialPoster);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(false);

  // What the login page will actually serve, so the preview is honest
  // about the fallback rather than showing an empty player.
  const effectiveVideo = video.trim() || defaultVideo;
  const effectivePoster = poster.trim() || defaultPoster;

  async function save() {
    setBusy(true);
    setErr("");
    setOk(false);
    const result = await saveLoginVideo({ video_url: video, poster_url: poster });
    setBusy(false);
    if (!result.ok) {
      setErr(result.error ?? "Could not save.");
      return;
    }
    setOk(true);
    router.refresh();
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[14px] font-bold text-ink-900">Login page video</p>
          <p className="mt-0.5 text-[11.5px] text-ink-500">
            Shown at the top of the login screen. Leave both empty to use the bundled video.
          </p>
        </div>
        {video.trim() === "" && poster.trim() === "" && (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-ink-500">
            using default
          </span>
        )}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_240px]">
        <div className="space-y-2.5">
          <div>
            <label className="nm-label" htmlFor="lv">Video URL (.mp4)</label>
            <input
              id="lv"
              className="nm-input"
              value={video}
              onChange={(e) => { setVideo(e.target.value); setOk(false); }}
              placeholder={defaultVideo}
              spellCheck={false}
            />
          </div>
          <div>
            <label className="nm-label" htmlFor="lp">Poster image URL (optional)</label>
            <input
              id="lp"
              className="nm-input"
              value={poster}
              onChange={(e) => { setPoster(e.target.value); setOk(false); }}
              placeholder={defaultPoster}
              spellCheck={false}
            />
            <p className="mt-1 text-[11px] leading-relaxed text-ink-400">
              The still frame shown while the video loads, and the fallback if autoplay is
              refused. Without one, a slow connection shows a black box.
            </p>
          </div>

          {err && <Alert tone="red">{err}</Alert>}
          {ok && !err && <Alert tone="green">Saved. The login page now serves this video.</Alert>}

          <div className="flex gap-2">
            <button onClick={save} disabled={busy} className="nm-btn-primary !py-2">
              {busy ? <><Spinner /> Saving…</> : "Save video"}
            </button>
            {(video || poster) && (
              <button
                onClick={() => { setVideo(""); setPoster(""); setOk(false); setErr(""); }}
                className="rounded-xl px-3 py-2 text-[12.5px] font-semibold text-ink-600 hover:bg-slate-100"
              >
                Reset to default
              </button>
            )}
          </div>
        </div>

        <div>
          <p className="nm-label">Preview</p>
          <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-ink-900">
            <video
              key={effectiveVideo}
              className="h-32 w-full object-cover"
              src={effectiveVideo}
              poster={effectivePoster}
              autoPlay
              loop
              muted
              playsInline
              controls={false}
              aria-label="Login video preview"
            />
          </div>
          <p className="mt-1 break-all text-[10.5px] leading-snug text-ink-400">
            {video.trim() ? "Custom video" : "Bundled video"}
          </p>
        </div>
      </div>
    </Card>
  );
}
