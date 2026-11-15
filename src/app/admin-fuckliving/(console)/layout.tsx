import { Logo, Badge } from "@/components/ui";
import { AdminNav } from "@/components/admin/admin-nav";
import { hasAdminKey } from "@/lib/supabase/admin";
import { dispatchPushThrottled } from "@/lib/push";
import Link from "next/link";

/**
 * Admin console shell.
 *
 * The auth gate is in `src/middleware.ts`, not here: no session redirects to
 * `/admin-fuckliving/login`, and a session that is not in `admin_users` gets a
 * 404. Every Server Action in this folder re-checks the same row through
 * `requireAdmin()` (`src/lib/admin-guard.ts`), because an action is its own
 * endpoint and can be called without ever rendering this layout.
 *
 * `force-dynamic` is required: every admin page shows live business numbers, so
 * nothing here may be statically cached at build time.
 */
export const dynamic = "force-dynamic";
export const metadata = { title: "NaijaMart admin" };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  /* Drive the push queue from the console too. The dispatcher used to run only
   * from the storefront layout, so an admin who lives in the console never
   * flushed anything — and an admin broadcast is precisely a notification that
   * needs delivering. Throttled and fire-and-forget; never breaks a page. */
  try {
    void dispatchPushThrottled();
  } catch {
    // ignore
  }

  return (
    <div className="min-h-screen bg-[var(--canvas)]">
      <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-white">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5">
          <Logo />
          <Badge tone="gray" className="hidden sm:inline-flex">
            Admin
          </Badge>
          <div className="ml-auto flex items-center gap-3 text-[12.5px]">
            <Link href="/" className="font-semibold text-ink-500 hover:text-ink-900">
              Storefront
            </Link>
          </div>
        </div>
        <div className="mx-auto max-w-7xl px-4">
          <AdminNav />
        </div>
      </header>

      {/* Safety net. `admin.ts` has NO committed fallback key any more, so on a
          deployment without `SUPABASE_SERVICE_ROLE_KEY` this banner is the
          expected state: it says so loudly instead of rendering an empty
          dashboard that looks like "no orders yet". */}
      {!hasAdminKey && (
        <div className="mx-auto max-w-7xl px-4 pt-3">
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-[12.5px] text-amber-900">
            <strong className="font-bold">Admin database access is not configured.</strong>{" "}
            <code className="rounded bg-amber-100 px-1 py-0.5 font-mono">
              SUPABASE_SERVICE_ROLE_KEY
            </code>{" "}
            is not set on this server. There is no committed fallback any more — a key in the
            repository is a leaked key. Until the variable is set in the deployment environment
            every page below is empty and no admin action can be saved. See README §1d.
          </div>
        </div>
      )}

      <main className="mx-auto max-w-7xl px-4 py-4 pb-16">{children}</main>
    </div>
  );
}
