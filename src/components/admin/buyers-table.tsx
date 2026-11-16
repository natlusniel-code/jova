"use client";

import { Avatar } from "@/components/ui";
import { ModerationControls } from "@/components/admin/moderation-controls";
import { shortDate } from "@/lib/utils";

/**
 * The buyers table.
 *
 * The moderation column used to be a single "Ban" toggle that wrote
 * `profiles.is_banned` directly. It is now the shared
 * `ModerationControls`, which offers suspend / ban / reactivate and goes
 * through `admin_moderate_user` — so a buyer can be suspended (temporary)
 * as well as banned (permanent), and either can be undone.
 */
export function BuyersTable({ buyers }: { buyers: any[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[12px]">
        <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-ink-400">
          <tr>
            <th className="px-4 py-2 font-semibold">Buyer</th>
            <th className="px-2 py-2 font-semibold">Location</th>
            <th className="px-2 py-2 font-semibold">Phone</th>
            <th className="px-2 py-2 font-semibold">Orders</th>
            <th className="px-2 py-2 font-semibold">Joined</th>
            <th className="px-4 py-2 font-semibold">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--line)]">
          {buyers.map((b) => (
            <tr key={b.id}>
              <td className="px-4 py-2">
                <div className="flex items-center gap-2">
                  <Avatar name={b.full_name} src={b.avatar_url} size={26} />
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink-900">{b.full_name}</p>
                    <p className="truncate text-[11px] text-ink-400">{b.email}</p>
                  </div>
                </div>
              </td>
              <td className="px-2 py-2 text-ink-600">{b.city}{b.state ? `, ${b.state}` : ""}</td>
              <td className="px-2 py-2 text-ink-600">{b.phone ?? "—"}</td>
              <td className="px-2 py-2 text-ink-600">{b.orderCount}</td>
              <td className="px-2 py-2 text-ink-500">{shortDate(b.created_at)}</td>
              <td className="px-4 py-2">
                <ModerationControls
                  userId={b.id}
                  name={b.full_name || "this buyer"}
                  status={b.moderation_status ?? (b.is_banned ? "banned" : "active")}
                  reason={b.moderation_reason}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
