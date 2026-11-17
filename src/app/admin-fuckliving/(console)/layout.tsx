import { Logo, Badge } from "@/components/ui";
import { AdminNav, AdminSidebar } from "@/components/admin/admin-nav";
import { hasAdminKey } from "@/lib/supabase/admin";
import { dispatchPushSafely } from "@/lib/push";
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

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  /* Drive the push queue from the console too. The dispatcher used to run only
   * from the storefront layout, so an admin who lives in the console never
   * flushed anything — and an admin broadcast is precisely a notification that
   * needs delivering.
   *
   * AWAITED with a 3s cap, not `void`-ed: on a serverless host an un-awaited
   * promise is killed when the response is sent, after the rows were already
   * claimed — so the broadcast was marked delivered and never sent. */
  try {
    await dispatchPushSafely();
  } catch {
    // ignore
  }

  return (
    <div className="min-h-screen bg-[var(--canvas)]">
      <header className="nm-sticky-chrome sticky top-0 z-30 border-b border-[var(--line)] bg-[#f6f5f1]/95 backdrop-blur-md">
        <div className="nm-wrap flex min-w-0 items-center gap-3 py-3">
          <Logo />
          <span className="hidden h-5 w-px bg-[var(--line)] sm:block" />
          <Badge tone="gray" className="hidden sm:inline-flex">
            Admin console
          </Badge>
          <div className="ml-auto flex shrink-0 items-center gap-2 text-[12.5px]">
            <Link href="/" className="nm-btn-ghost nm-btn-sm">
              Storefront
            </Link>
          </div>
        </div>
        <div className="nm-wrap">
          <AdminNav />
        </div>
      </header>

      {/* Safety net. `admin.ts` has NO committed fallback key any more, so on a
          deployment without `SUPABASE_SERVICE_ROLE_KEY` this banner is the
          expected state: it says so loudly instead of rendering an empty
          dashboard that looks like "no orders yet". */}
      {!hasAdminKey && (
        <div className="nm-wrap pt-4">
          <div className="rounded-xl border border-[#f2d9a8] bg-[#fdf7ec] px-3.5 py-2.5 text-[12.5px] text-[#7a4f08]">
            <strong className="font-bold">Admin database access is not configured.</strong>{" "}
            <code className="rounded bg-[#fbeed3] px-1 py-0.5 font-mono">
              SUPABASE_SERVICE_ROLE_KEY
            </code>{" "}
            is not set on this server. There is no committed fallback any more — a key in the
            repository is a leaked key. Until the variable is set in the deployment environment
            every page below is empty and no admin action can be saved. See README §1d.
          </div>
        </div>
      )}

      <div className="nm-wrap flex gap-8 py-6 pb-20">
        <AdminSidebar />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
