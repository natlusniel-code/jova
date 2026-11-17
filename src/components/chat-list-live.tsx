"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Presence for the chat LIST.
 *
 * ── Why a separate hook from `useChatPresence` ──────────────────────────
 * The thread hook joins a channel per conversation, which is right when
 * you are in one thread. The list shows every conversation at once, so
 * joining one channel per row would open a socket per chat — a buyer with
 * twenty threads would hold twenty subscriptions just to draw twenty
 * dots.
 *
 * Instead there is ONE app-wide channel, `nm-presence`. Every signed-in
 * client tracks itself on it, so `presenceState()` is the set of people
 * who currently have NaijaMart open. That answers "online" for every row
 * at once, and it is honest: it means "has the app open right now", not
 * "read a message an hour ago".
 *
 * ── Typing ──────────────────────────────────────────────────────────────
 * Typing is a broadcast on the same channel carrying the chat id, so the
 * list can show "typing…" on the right row. The thread sends it (see
 * `useChatPresence`), throttled, and it expires after four seconds — a
 * closed tab cannot leave a row stuck on "typing…".
 *
 * ── The seller exception ────────────────────────────────────────────────
 * A seller may be in the hub rather than in a thread, and the hub tracks
 * presence too, so a seller with the hub open reads as online. That is
 * the same rule the thread uses, so the two views never disagree.
 */
const TYPING_TTL_MS = 4_000;

export type PresenceMap = Record<string, "online" | "offline">;
export type TypingMap = Record<string, boolean>;

export function useChatListPresence({
  meId,
  otherIds,
}: {
  meId: string;
  otherIds: string[];
}) {
  const [online, setOnline] = useState<PresenceMap>({});
  const [typing, setTyping] = useState<TypingMap>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // The ids are a new array on every render; a joined string is a stable
  // dependency that only changes when the set of people actually changes.
  const key = otherIds.slice().sort().join(",");

  useEffect(() => {
    const supabase = createClient();
    const ch = supabase.channel("nm-presence", {
      config: {
        broadcast: { self: false },
        presence: { key: meId },
      },
    });

    const sync = () => {
      const state = ch.presenceState() as Record<string, unknown[]>;
      const next: PresenceMap = {};
      for (const id of key ? key.split(",") : []) {
        next[id] = Object.prototype.hasOwnProperty.call(state, id) ? "online" : "offline";
      }
      setOnline(next);
    };

    ch.on("presence", { event: "sync" }, sync);
    ch.on("presence", { event: "join" }, sync);
    ch.on("presence", { event: "leave" }, sync);

    ch.on("broadcast", { event: "typing" }, ({ payload }: { payload: any }) => {
      const from = payload?.from as string | undefined;
      const chatId = payload?.chat_id as string | undefined;
      if (!from || !chatId) return;
      setTyping((t) => ({ ...t, [chatId]: true }));
      if (timers.current[chatId]) clearTimeout(timers.current[chatId]);
      timers.current[chatId] = setTimeout(() => {
        setTyping((t) => ({ ...t, [chatId]: false }));
      }, TYPING_TTL_MS);
    });

    ch.on("broadcast", { event: "stop-typing" }, ({ payload }: { payload: any }) => {
      const chatId = payload?.chat_id as string | undefined;
      if (!chatId) return;
      if (timers.current[chatId]) clearTimeout(timers.current[chatId]);
      setTyping((t) => ({ ...t, [chatId]: false }));
    });

    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        void ch.track({ user_id: meId, at: Date.now() });
        sync();
      }
    });

    return () => {
      for (const t of Object.values(timers.current)) clearTimeout(t);
      timers.current = {};
      supabase.removeChannel(ch);
    };
  }, [meId, key]);

  return { online, typing };
}
