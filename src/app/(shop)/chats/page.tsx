import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui";
import { SupportLink } from "@/components/support-link";
import { ChatListRows } from "@/components/chat-list-rows";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chats" };

/**
 * The chat list.
 *
 * ── What changed ────────────────────────────────────────────────────────
 * Each row now carries a presence indicator — a green dot and "Online", a
 * grey dot and "Offline", or an animated "typing…" — exactly as the
 * reference shows. The rows themselves are rendered by a client
 * component (`ChatListRows`) because presence is live: it comes from a
 * Realtime channel, not from the server render.
 *
 * ── What is preserved ───────────────────────────────────────────────────
 * The query, the ordering (most recently active first), the per-thread
 * unread badge, the order reference and total, and the "You:" prefix on
 * your own last message are all unchanged. Only the presentation and the
 * presence layer are new.
 */
export default async function ChatsPage() {
  const session = await getSession();
  if (!session) redirect("/signin?next=%2Fchats");

  const supabase = createClient();
  const uid = session.user.id;

  const { data: chats } = await supabase
    .from("chats")
    .select(`
      id, order_id, created_at, buyer_id, seller_id, shop_id,
      shops(name,logo_url,slug),
      orders(reference,status,total),
      messages(body,created_at,sender_id)
    `)
    .or(`buyer_id.eq.${uid},seller_id.eq.${uid}`)
    .order("created_at", { ascending: false })
    // The embedded messages must be ordered too. Without this the array came
    // back in whatever order PostgREST chose, so `slice(-1)` picked an
    // arbitrary message and the list sorted by a stale timestamp — a thread
    // replied to a minute ago could sit below one silent for hours.
    .order("created_at", { referencedTable: "messages", ascending: false });

  // counterpart names
  const otherIds = Array.from(
    new Set((chats ?? []).map((c: any) => (c.buyer_id === uid ? c.seller_id : c.buyer_id))),
  );
  let people: Record<string, { full_name: string; avatar_url: string | null }> = {};
  if (otherIds.length) {
    const { data } = await supabase
      .from("profiles_public")
      .select("id,full_name,avatar_url")
      .in("id", otherIds);
    people = Object.fromEntries((data ?? []).map((p: any) => [p.id, p]));
  }

  const sorted = (chats ?? []).slice().sort((a: any, b: any) => {
    const la = a.messages?.slice(-1)[0]?.created_at ?? a.created_at;
    const lb = b.messages?.slice(-1)[0]?.created_at ?? b.created_at;
    return new Date(lb).getTime() - new Date(la).getTime();
  });

  // One badge per thread, so a buyer with several conversations can see which
  // one is waiting on them instead of a single number on the tab bar.
  const { data: unreadRows } = await supabase.rpc("chat_unread_counts");
  const unreadByChat = new Map<string, number>(
    ((unreadRows ?? []) as any[]).map((r) => [r.chat_id, Number(r.unread) || 0]),
  );

  if (sorted.length === 0) {
    return (
      <div>
        <h1 className="mb-4 text-[26px] font-extrabold tracking-[-0.03em] text-ink-900">Chats</h1>
        <EmptyState
          icon="💬"
          title="No conversations yet"
          body="Message a seller about an item, or request a quote for a service — the thread will appear here."
          action="Browse the marketplace"
          href="/"
        />
      </div>
    );
  }

  // Everything the client needs, flattened. Passing the raw Supabase rows
  // would ship the whole embedded tree to the browser for no reason.
  const rows = sorted.map((c: any) => {
    const otherId = c.buyer_id === uid ? c.seller_id : c.buyer_id;
    const person = people[otherId];
    const last = c.messages?.slice(-1)[0];
    const amSeller = c.seller_id === uid;
    return {
      id: c.id,
      otherId,
      name: amSeller
        ? person?.full_name ?? "Buyer"
        : c.shops?.name ?? person?.full_name ?? "Seller",
      avatar: person?.avatar_url ?? null,
      lastBody: last?.body ?? null,
      lastAt: last?.created_at ?? c.created_at,
      mine: last?.sender_id === uid,
      unread: unreadByChat.get(c.id) ?? 0,
      reference: c.orders?.reference ?? null,
      total: c.orders?.total ?? null,
      unpaid: c.orders?.status === "pending_payment",
    };
  });

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-[26px] font-extrabold tracking-[-0.03em] text-ink-900">Chats</h1>
        <span className="text-[12px] font-medium text-ink-400">
          {rows.length} conversation{rows.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="mt-4">
        <ChatListRows meId={uid} rows={rows} />
      </div>

      <p className="mt-4 text-center text-[12.5px] text-ink-500">
        Something wrong with a chat? <SupportLink>Contact support</SupportLink>
      </p>
    </div>
  );
}
