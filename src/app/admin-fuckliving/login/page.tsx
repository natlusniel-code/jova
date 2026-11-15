import { Suspense } from "react";
import { AdminLoginForm } from "@/components/admin/admin-login-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin sign in", robots: { index: false, follow: false } };

/**
 * The admin sign-in page.
 *
 * ── Why it is separate from `/signin` ─────────────────────────────────────
 * The public sign-in page carries a "Create an account" link, a marketing
 * panel and a video. None of that belongs on a staff door: there is no
 * self-service admin signup, and offering one would be a lie. This page is
 * email + password and nothing else.
 *
 * ── Why it is not linked from anywhere ────────────────────────────────────
 * It is reached only by the middleware redirect when an unauthenticated
 * visitor asks for the console. `robots: noindex` keeps it out of search
 * results as well.
 */
export default function AdminLoginPage() {
  return (
    <div className="grid min-h-screen place-items-center bg-[var(--canvas)] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-ink-900 text-[20px] text-white">
            🔐
          </div>
          <h1 className="mt-3 text-[22px] font-extrabold tracking-tight text-ink-900">
            Admin sign in
          </h1>
          <p className="mt-1 text-[13px] text-ink-500">
            Staff access only. There is no sign-up on this page.
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-card">
          <Suspense fallback={<div className="h-56 nm-skeleton rounded-xl" />}>
            <AdminLoginForm />
          </Suspense>
        </div>

        <p className="mt-4 text-center text-[11.5px] leading-relaxed text-ink-400">
          Not staff? Use the normal{" "}
          <a href="/signin" className="font-semibold text-brand-700 hover:underline">
            sign-in page
          </a>
          .
        </p>
      </div>
    </div>
  );
}
