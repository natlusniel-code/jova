"use client";

/**
 * Error boundary for the admin console.
 *
 * `createAdminClient()` throws when `SUPABASE_SERVICE_ROLE_KEY` is missing —
 * deliberately, because the alternative (a committed fallback key) is a leaked
 * credential. Without this boundary that throw would surface as a generic
 * Next.js 500 on every admin URL.
 *
 * This turns it into the message an operator can act on: the console is not
 * configured, here is the variable, here is where to set it. It is the loud
 * failure the removal of the fallback was meant to produce.
 */
export default function AdminConsoleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const notConfigured = /SUPABASE_SERVICE_ROLE_KEY/i.test(error.message);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5">
        <h1 className="text-[15px] font-bold text-amber-900">
          {notConfigured
            ? "Admin database access is not configured."
            : "The admin console hit an error."}
        </h1>

        {notConfigured ? (
          <div className="mt-2 space-y-2 text-[13px] leading-relaxed text-amber-900">
            <p>
              <code className="rounded bg-amber-100 px-1 py-0.5 font-mono">
                SUPABASE_SERVICE_ROLE_KEY
              </code>{" "}
              is not set on this server. There is no committed fallback any more — a key in the
              repository is a leaked key.
            </p>
            <p>
              Set it in the deployment environment (Vercel → Project Settings → Environment
              Variables, for Production and Preview), then redeploy. See README §1d.
            </p>
          </div>
        ) : (
          <p className="mt-2 text-[13px] leading-relaxed text-amber-900">{error.message}</p>
        )}

        <button
          type="button"
          onClick={reset}
          className="mt-4 rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-amber-900 hover:bg-amber-100"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
