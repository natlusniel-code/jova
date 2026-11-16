"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient, uploadToBucket, currentUserId, updateOne } from "@/lib/supabase/client";
import { NIGERIA_STATES, lgasFor } from "@/lib/utils";
import { Avatar, Spinner, Alert, Card } from "@/components/ui";

export function AvatarEditor({ avatarUrl, name }: { avatarUrl: string | null; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState(avatarUrl);
  const [err, setErr] = useState("");

  async function pick(file: File) {
    setBusy(true);
    setErr("");
    try {
      // Resolve the user BEFORE uploading. The old order uploaded the file
      // first and only then discovered there was no session, which left an
      // orphaned object in the bucket and a bare TypeError on screen.
      const me = await currentUserId();
      if (!me.ok) throw new Error(me.error);

      const publicUrl = await uploadToBucket(file, "avatars");
      const saved = await updateOne("profiles", { avatar_url: publicUrl }, { id: me.id });
      if (!saved.ok) throw new Error(saved.error);

      setUrl(publicUrl);
      router.refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Could not save your photo.");
    }
    setBusy(false);
  }

  return (
    <div className="relative">
      <Avatar name={name} src={url} size={64} />
      <label className="absolute -bottom-1 -right-1 grid h-6 w-6 cursor-pointer place-items-center rounded-full border-2 border-white bg-brand-500 text-white shadow-sm hover:bg-brand-600">
        {busy ? (
          <Spinner className="!h-3 !w-3" />
        ) : (
          <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.4}>
            <path d="M4 8h3l1.5-2h7L17 8h3v11H4V8Z" />
            <circle cx="12" cy="13" r="3" />
          </svg>
        )}
        <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])} />
      </label>
      {err && <p className="absolute left-0 top-16 w-40 text-[10px] text-red-600">{err}</p>}
    </div>
  );
}

export function ProfileForm({
  initial,
}: {
  initial: { full_name: string; phone: string; state: string; city: string };
}) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState("");
  const lg = lgasFor(form.state);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    setOk(false);

    // ── What was wrong here ────────────────────────────────────────────
    // This read `u.user!.id` and then called `.update(...).eq(...)` with no
    // `.select()`. Two silent failures in one:
    //
    //   * if the session had not hydrated, `u.user` was null and the `!`
    //     threw a TypeError inside an async handler — the button stayed on
    //     "Saving…" forever with no message;
    //   * if RLS filtered the row, the update wrote nothing and still
    //     returned `error: null`, so the form said "Saved." and the old
    //     values came back on the next refresh.
    //
    // `currentUserId` and `updateOne` turn both into a visible message.
    const me = await currentUserId();
    if (!me.ok) {
      setBusy(false);
      setErr(me.error);
      return;
    }

    const saved = await updateOne(
      "profiles",
      {
        full_name: form.full_name.trim(),
        phone: form.phone.trim(),
        state: form.state,
        city: form.city,
      },
      { id: me.id },
    );

    setBusy(false);
    if (!saved.ok) {
      setErr(saved.error);
      return;
    }
    setOk(true);
    router.refresh();
  }

  return (
    <Card className="p-4">
      <p className="text-[14px] font-bold text-ink-900">Your details</p>
      <form onSubmit={save} className="mt-2.5 space-y-2.5">
        <div>
          <label className="nm-label" htmlFor="fn">Full name</label>
          <input id="fn" className="nm-input" value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} />
        </div>
        <div>
          <label className="nm-label" htmlFor="ph">Phone number</label>
          <input id="ph" className="nm-input" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="08012345678" />
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className="nm-label" htmlFor="st">State</label>
            <select id="st" className="nm-input" value={form.state}
              onChange={(e) => setForm((f) => ({ ...f, state: e.target.value, city: lgasFor(e.target.value)[0] ?? f.city }))}>
              {NIGERIA_STATES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="nm-label" htmlFor="ct">City / LGA</label>
            <select id="ct" className="nm-input" value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}>
              {(lg.length ? lg : [form.city]).filter(Boolean).map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <p className="text-[11.5px] leading-relaxed text-ink-400">
          Your city decides which sellers you can order from. You can browse anywhere.
        </p>
        {err && <Alert tone="red">{err}</Alert>}
        {ok && !err && <Alert tone="green">Saved.</Alert>}
        <button type="submit" disabled={busy} className="nm-btn-primary w-full !py-2.5">
          {busy ? <><Spinner /> Saving…</> : "Save details"}
        </button>
      </form>
    </Card>
  );
}
