"use client";

import { useEffect, useState } from "react";
import { pingAppwrite, type AppwritePingResult } from "@/lib/appwrite/client";
import { cn } from "@/lib/utils";

/**
 * Runs `client.ping()` once when the app starts and reports the result.
 *
 * ── Why a component and not a module side-effect ────────────────────────────
 * A bare `client.ping()` at module scope would fire during server rendering
 * (where there is no `localStorage` and the Web SDK throws) and again on every
 * import. Mounting it in the root layout means it runs exactly once, in the
 * browser, after hydration — which is what "when the app starts" means here.
 *
 * ── Why it is a small pill, not a banner ────────────────────────────────────
 * The marketplace is a live site with real buyers. A permanent "Appwrite
 * connected" banner would be noise on every page. So the success state is a
 * quiet pill that fades out after a few seconds, and only a FAILURE stays on
 * screen — because that is the case the user needs to know about (Google
 * sign-in will not work). Both use the site's existing tokens: brand green for
 * healthy, the same red the Alert component uses for a problem.
 *
 * ── Why it is dismissible ───────────────────────────────────────────────────
 * A failed ping is not fatal: Supabase auth and the whole marketplace still
 * work. The pill can be closed so it never blocks the page.
 */
export function AppwriteStatus() {
  const [result, setResult] = useState<AppwritePingResult | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let alive = true;

    pingAppwrite().then((r) => {
      if (alive) setResult(r);
    });

    return () => {
      alive = false;
    };
  }, []);

  // Fade the healthy pill out on its own; a failure stays until dismissed.
  useEffect(() => {
    if (!result?.ok) return;
    const t = setTimeout(() => setHidden(true), 4000);
    return () => clearTimeout(t);
  }, [result]);

  if (!result || hidden) return null;

  if (result.ok) {
    return (
      <div
        role="status"
        className={cn(
          "pointer-events-none fixed bottom-4 left-1/2 z-[60] -translate-x-1/2",
          "flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50",
          "px-3.5 py-1.5 text-[12px] font-semibold text-brand-700 shadow-card",
        )}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-brand-500" aria-hidden="true" />
        Appwrite connected · {result.projectName}
      </div>
    );
  }

  return (
    <div
      role="alert"
      className={cn(
        "fixed bottom-4 left-1/2 z-[60] w-[calc(100%-2rem)] max-w-[430px] -translate-x-1/2",
        "rounded-xl2 border border-[#f3c9c9] bg-[#fdf2f2] px-4 py-3 shadow-lift",
      )}
    >
      <div className="flex items-start gap-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold text-[#8f1d1d]">
            Google sign-in is unavailable
          </p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-[#8f1d1d]/80">
            Could not reach Appwrite at {result.endpoint}. Email and password
            sign-in still works.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setHidden(true)}
          aria-label="Dismiss"
          className="-mr-1 -mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[#8f1d1d]/60 hover:bg-[#f3c9c9]/50 hover:text-[#8f1d1d]"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path
              d="M1 1l10 10M11 1L1 11"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
