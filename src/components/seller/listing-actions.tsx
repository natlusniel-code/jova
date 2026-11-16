"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Spinner } from "@/components/ui";

export function ListingRowActions({ id, status, title }: { id: string; status: string; title: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);

  /**
   * ── Why every write here now checks its result ────────────────────────
   * These three actions all used to fire and forget:
   *
   *     await supabase.from("listings").update({ status }).eq("id", id);
   *     router.refresh();
   *
   * A PostgREST UPDATE that RLS filters out returns `error: null` and
   * writes nothing, so "Pause" on a listing the seller no longer owns
   * looked like it worked and then reverted on refresh. The same for
   * delete. `.select("id")` makes the database return the rows it actually
   * touched, so zero rows becomes a message instead of a silent no-op.
   */
  async function patch(nextStatus: string) {
    setBusy(nextStatus);
    setErr("");
    const supabase = createClient();
    const { data, error } = await supabase
      .from("listings")
      .update({ status: nextStatus })
      .eq("id", id)
      .select("id");
    setBusy("");
    if (error) { setErr(error.message); return; }
    if (!data || data.length === 0) {
      setErr("That change was not saved. The listing may have been removed.");
      return;
    }
    router.refresh();
  }

  async function duplicate() {
    setBusy("duplicate");
    setErr("");
    const supabase = createClient();
    const { data } = await supabase.from("listings").select("*").eq("id", id).single();
    if (data) {
      const { id: _drop, created_at, updated_at, views, ...rest } = data as any;
      const { error } = await supabase
        .from("listings")
        .insert({ ...rest, title: `${rest.title} (copy)`, status: "draft" });
      if (error) { setBusy(""); setErr(error.message); return; }
    }
    setBusy("");
    router.refresh();
  }

  async function remove() {
    setBusy("delete");
    setErr("");
    const supabase = createClient();
    const { data, error } = await supabase
      .from("listings")
      .delete()
      .eq("id", id)
      .select("id");
    setBusy("");
    setConfirmDel(false);
    if (error) { setErr(error.message); return; }
    if (!data || data.length === 0) {
      setErr("That listing was not deleted. It may already be gone.");
      return;
    }
    router.refresh();
  }

  if (confirmDel) {
    return (
      <div className="flex items-center justify-between gap-2 py-0.5">
        <span className="truncate text-[11px] text-red-700">Delete “{title}”?</span>
        <span className="flex shrink-0 gap-1">
          <button onClick={remove} className="rounded-md bg-red-600 px-2 py-1 text-[11px] font-semibold text-white">
            {busy === "delete" ? "…" : "Delete"}
          </button>
          <button onClick={() => setConfirmDel(false)} className="rounded-md px-2 py-1 text-[11px] font-semibold text-ink-600">No</button>
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-[11.5px] font-semibold">
      <Link href={`/seller/listings/${id}`} className="text-brand-600 hover:underline">Edit</Link>
      <button onClick={duplicate} className="text-ink-500 hover:text-ink-900">
        {busy === "duplicate" ? "…" : "Duplicate"}
      </button>
      {status === "live" ? (
        <button onClick={() => patch("hidden")} className="text-ink-500 hover:text-ink-900">
          {busy === "hidden" ? "…" : "Hide"}
        </button>
      ) : (
        <button onClick={() => patch("live")} className="text-ink-500 hover:text-ink-900">
          {busy === "live" ? "…" : "Publish"}
        </button>
      )}
      <button onClick={() => setConfirmDel(true)} className="ml-auto text-red-500 hover:text-red-700">Delete</button>
      {err && <p className="w-full text-[10.5px] font-medium text-red-600">{err}</p>}
    </div>
  );
}
