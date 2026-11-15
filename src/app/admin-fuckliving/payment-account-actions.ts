"use server";

/**
 * Payment-account writes for the admin console.
 *
 * ── Why this file exists ───────────────────────────────────────────────────
 * The payment-accounts page used to call
 * `supabase.rpc("admin_save_payment_account", …)` and
 * `supabase.rpc("admin_delete_payment_account", …)` straight from the browser.
 * Both RPCs (sql/0011) open with:
 *
 *     if not public.is_admin() then raise exception 'Admins only.'; end if;
 *
 * and `public.is_admin()` was true only when the caller had a row in
 * `public.admin_users`. The console itself had no sign-in gate — it read
 * through the service role — so a signed-in admin whose account was never
 * inserted into `admin_users` got "Admins only." on every save.
 *
 * The first fix moved the write here and reproduced the RPC's rules in
 * TypeScript. That left the rules in two places, which is exactly the drift
 * this task removes: `sql/0043` fixes `is_admin()` to accept a `service_role`
 * caller, so these actions now call the RPCs and the rules live only in SQL.
 *
 * ── Why `requireAdmin()` is the first line ─────────────────────────────────
 * A Server Action is its own endpoint. The middleware gate covers the page,
 * not this mutation, so the admin check is repeated here.
 */
import { revalidatePath } from "next/cache";
import { createAdminClient, hasAdminKey } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin-guard";

/** Same `{ ok, error }` shape `actions.ts` returns, declared here so this
 *  module is self-contained (a bundled server action must own its types). */
export type ActionResult = { ok: boolean; error?: string };

const NO_KEY =
  "SUPABASE_SERVICE_ROLE_KEY is not set on the server, so admin writes are disabled. See README §1d.";

function fail(error: unknown): ActionResult {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : (error as { message?: string } | null)?.message ?? "Something went wrong.";
  return { ok: false, error: message };
}

function refresh() {
  revalidatePath("/admin-fuckliving/payment-accounts");
  revalidatePath("/admin-fuckliving");
  revalidatePath("/checkout");
}

export type PaymentAccountInput = {
  id?: string | null;
  bank_name: string;
  account_number: string;
  account_name: string;
  label?: string | null;
  note?: string | null;
  active?: boolean;
  sort_order?: number;
};

/**
 * Create a payment account, or update one when `id` is set.
 *
 * The three-required-fields rule and the trimming/normalisation are
 * `admin_save_payment_account` in SQL (sql/0011) — not repeated here.
 */
export async function savePaymentAccount(
  input: PaymentAccountInput,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return { ok: false, error: admin.error };
  if (!hasAdminKey) return { ok: false, error: NO_KEY };

  try {
    const supabase = createAdminClient();

    const { error } = await supabase.rpc("admin_save_payment_account", {
      p_id: input.id ?? null,
      p_bank_name: input.bank_name ?? "",
      p_account_number: input.account_number ?? "",
      p_account_name: input.account_name ?? "",
      p_label: input.label ?? null,
      p_note: input.note ?? null,
      p_active: input.active ?? true,
      p_sort_order: Number.isFinite(Number(input.sort_order)) ? Number(input.sort_order) : 0,
    });
    if (error) return fail(error);

    refresh();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

/**
 * Remove an account — deactivating it instead when an order used it, so order
 * history keeps a real row to point at. That rule is
 * `admin_delete_payment_account` in SQL (sql/0011).
 */
export async function deletePaymentAccount(id: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return { ok: false, error: admin.error };
  if (!hasAdminKey) return { ok: false, error: NO_KEY };

  try {
    const supabase = createAdminClient();

    const { error } = await supabase.rpc("admin_delete_payment_account", {
      p_id: id,
    });
    if (error) return fail(error);

    refresh();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}
