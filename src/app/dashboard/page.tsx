import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/supabase/server";
import { Logo, Badge, Avatar } from "@/components/ui";
import { SignOutButton } from "@/components/sign-out-button";

export const metadata = { title: "Dashboard" };

/**
 * `/dashboard` — the signed-in mini dashboard.
 *
 * ── The guard ───────────────────────────────────────────────────────────────
 * `getSession()` runs on the server before any protected UI renders. No session
 * means an immediate redirect to /auth — the dashboard markup is never sent to
 * an anonymous visitor, so there is nothing to flash and nothing to leak.
 *
 * ── Why it reads the Supabase session, not Appwrite ─────────────────────────
 * The Appwrite session lives in the browser's localStorage and cannot be read
 * on the server. The Supabase session is the one the marketplace is built on,
 * and the Google bridge mints it, so it is the authoritative "am I signed in"
 * check for every server-rendered page. The name shown here comes from the
 * `profiles` row the bridge created.
 */
export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/auth");

  const { profile, isAdmin, shop } = session;
  const displayName = profile.full_name || profile.email || "there";
  const initial = displayName.trim().charAt(0).toUpperCase() || "N";

  return (
    <div className="min-h-screen bg-[var(--canvas)]">
      {/* header */}
      <header className="nm-sticky-chrome sticky top-0 z-20 border-b border-[var(--line)] bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Logo />
          <SignOutButton />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        {/* identity card */}
        <section className="nm-card p-5">
          <div className="flex items-center gap-3.5">
            <Avatar name={displayName} src={profile.avatar_url} size={48} />
            <div className="min-w-0">
              <h1 className="truncate text-[20px] font-extrabold tracking-tight text-ink-900">
                {displayName}
              </h1>
              <p className="truncate text-[13px] text-ink-500">
                {profile.email ?? "No email on file"}
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Badge tone={profile.role === "seller" ? "green" : "blue"}>
              {profile.role === "seller" ? "Seller" : "Buyer"}
            </Badge>
            {isAdmin && <Badge tone="violet">Admin</Badge>}
            {shop?.verified && <Badge tone="green" dot>Verified shop</Badge>}
            {profile.state && <Badge tone="gray">{profile.state}</Badge>}
          </div>
        </section>

        {/* quick links */}
        <section className="mt-4 grid gap-3 sm:grid-cols-2">
          {shop ? (
            <Link href="/seller" className="nm-card block p-4 transition hover:shadow-lift">
              <p className="text-[14.5px] font-semibold text-ink-900">Seller Hub</p>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-500">
                Orders, listings and payouts for {shop.name}.
              </p>
            </Link>
          ) : (
            <Link href="/seller/onboarding" className="nm-card block p-4 transition hover:shadow-lift">
              <p className="text-[14.5px] font-semibold text-ink-900">Start selling</p>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-500">
                Open a shop and list your first product.
              </p>
            </Link>
          )}

          <Link href="/" className="nm-card block p-4 transition hover:shadow-lift">
            <p className="text-[14.5px] font-semibold text-ink-900">Browse the marketplace</p>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-500">
              Buy and hire from verified sellers in your state.
            </p>
          </Link>
        </section>

        <p className="mt-6 text-[11.5px] leading-relaxed text-ink-400">
          Signed in with Google. Your NaijaMart account is linked to{" "}
          {profile.email ?? "your Google account"}.
        </p>
      </main>
    </div>
  );
}
