"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { moderateUser } from "@/app/admin-fuckliving/actions";
import { Badge, Spinner } from "@/components/ui";

/**
 * Suspend / ban / reactivate an account, from the admin console.
 *
 * ── Why one component for buyers and sellers ──────────────────────────
 * The two pages had different, both-broken controls: the Buyers table had
 * a single "Ban" toggle that wrote a boolean, and the Sellers page had a
 * "Suspend" toggle that could never reactivate. Moderation is the same
 * operation on the same table (`profiles`), so it is one component with
 * one set of states, used in both places. A fix here is a fix in both.
 *
 * ── Why the reason is collected before the action ─────────────────────
 * The reason is shown to the person who is blocked, and the RPC refuses a
 * suspension or ban without one. Collecting it up front means the admin
 * never gets a rejection after the fact, and the person always learns why
 * — an unexplained block is indistinguishable from a bug.
 *
 * ── Why "reactivate" is a separate button, not a toggle ───────────────
 * A toggle has to infer the intent from the current state, and that is
 * exactly how the old seller control came to write "suspended" when the
 * admin clicked "Reactivate". Here the three transitions are named, so
 * the intent is never guessed.
 */
export type ModerationStatus = "active" | "suspended" | "banned";

export function ModerationControls({
  userId,
  name,
  status,
  reason,
  compact = false,
}: {
  userId: string;
  name: string;
  status: ModerationStatus;
  reason?: string | null;
  compact?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [mode, setMode] = useState<"" | "suspend" | "ban">("");
  // Named `note`, not `reason`: `reason` is the prop carrying the reason
  // already on the account, and shadowing it would make the resting state
  // render the draft instead of the stored value.
  const [note, setNote] = useState("");

  async function run(action: "suspend" | "ban" | "reactivate", why?: string) {
    setBusy(action);
    setErr("");
    const result = await moderateUser(userId, action, why);
    setBusy("");
    if (!result.ok) {
      setErr(result.error ?? "Could not save.");
      return;
    }
    setMode("");
    router.refresh();
  }

  // ── The confirmation step ────────────────────────────────────────────
  if (mode) {
    const isBan = mode === "ban";
    return (
      <div className="w-64 rounded-xl border border-[var(--line)] bg-slate-50 p-2.5 text-left">
        <p className="text-[11.5px] font-bold text-ink-900">
          {isBan ? `Ban ${name}?` : `Suspend ${name}?`}
        </p>
        <p className="mt-0.5 text-[10.5px] leading-relaxed text-ink-500">
          {isBan
            ? "Permanent. They cannot sign in or order, and their shop comes down."
            : "Temporary. They cannot order, but can still read their orders."}
        </p>
        <textarea
          rows={2}
          autoFocus
          className="nm-input mt-1.5 resize-none !py-1.5 !text-[11.5px]"
          placeholder={isBan ? "e.g. Selling counterfeit goods" : "e.g. Repeated abusive messages"}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        {err && <p className="mt-1 text-[10.5px] font-medium text-red-600">{err}</p>}
        <div className="mt-1.5 flex gap-1.5">
          <button
            onClick={() => run(mode, note)}
            disabled={!!busy}
            className={`flex-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-white ${isBan ? "bg-red-600" : "bg-ink-900"}`}
          >
            {busy ? "…" : isBan ? "Ban account" : "Suspend account"}
          </button>
          <button
            onClick={() => { setMode(""); setErr(""); setNote(""); }}
            className="rounded-lg px-2 py-1.5 text-[11px] font-semibold text-ink-600"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ── The resting state ────────────────────────────────────────────────
  return (
    <div className={compact ? "text-right" : ""}>
      <div className="flex flex-wrap items-center gap-1.5">
        {status === "banned" && <Badge tone="red">banned</Badge>}
        {status === "suspended" && <Badge tone="amber">suspended</Badge>}

        {status === "active" ? (
          <>
            <button
              onClick={() => setMode("suspend")}
              disabled={!!busy}
              className="text-[11.5px] font-semibold text-amber-700 hover:underline"
            >
              Suspend
            </button>
            <span className="text-ink-300">·</span>
            <button
              onClick={() => setMode("ban")}
              disabled={!!busy}
              className="text-[11.5px] font-semibold text-red-600 hover:underline"
            >
              Ban
            </button>
          </>
        ) : (
          <button
            onClick={() => run("reactivate")}
            disabled={!!busy}
            className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-brand-600 hover:underline"
          >
            {busy === "reactivate" ? <Spinner className="!h-3 !w-3" /> : null}
            Reactivate
          </button>
        )}
      </div>

      {/* The reason is kept visible while the account is blocked, so the
          next admin to open this page knows why without digging. */}
      {status !== "active" && reason && (
        <p className="mt-0.5 max-w-[220px] text-[10.5px] leading-snug text-ink-500">
          {reason}
        </p>
      )}
      {err && <p className="mt-0.5 text-[10.5px] font-medium text-red-600">{err}</p>}
    </div>
  );
}
