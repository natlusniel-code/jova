import { createAdminClient } from "@/lib/supabase/admin";
import { shortDate } from "@/lib/utils";
import { Card, Badge, EmptyState, Avatar } from "@/components/ui";
import { BuyersTable } from "@/components/admin/buyers-table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Buyers" };

export default async function AdminBuyersPage() {
  const supabase = createAdminClient();
  const { data: buyers } = await supabase
    .from("profiles")
    .select("id,full_name,email,phone,state,city,created_at,is_banned,avatar_url,moderation_status,moderation_reason")
    .eq("role", "buyer")
    .order("created_at", { ascending: false });

  const list = buyers ?? [];
  const { data: counts } = await supabase.from("orders").select("buyer_id");

  // "Blocked" counts both suspended and banned — the number an operator
  // wants is "how many people cannot order right now", not a breakdown.
  const blocked = list.filter(
    (b: any) => (b.moderation_status ?? (b.is_banned ? "banned" : "active")) !== "active",
  ).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-[22px] font-extrabold tracking-tight text-ink-900">Buyers</h1>
        <p className="text-[12.5px] text-ink-500">{list.length} registered · {blocked} blocked</p>
      </div>

      <Card className="overflow-hidden">
        {list.length === 0 ? (
          <div className="p-4">
            <EmptyState icon="👥" title="No buyers yet" body="Buyers appear here as soon as they create an account." />
          </div>
        ) : (
          <BuyersTable
            buyers={list.map((b: any) => ({
              ...b,
              orderCount: (counts ?? []).filter((o: any) => o.buyer_id === b.id).length,
            }))}
          />
        )}
      </Card>
    </div>
  );
}
