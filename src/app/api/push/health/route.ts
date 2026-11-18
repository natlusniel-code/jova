import { NextResponse } from "next/server";
import { createAdminClient, hasAdminKey } from "@/lib/supabase/admin";
import { pushConfigured } from "@/lib/push";
import { VAPID_PUBLIC_KEY } from "@/lib/push-public";
import { jobsSecretOrNull } from "@/lib/jobs-secret";

/**
 * GET /api/push/health
 *
 * Answers the one question that was impossible to answer before: "is push
 * actually working, and if not, which link in the chain is broken?"
 *
 * Every failure mode of Web Push is silent by nature. A missing service-role
 * key, a VAPID pair that does not match, a `push_subscriptions` table with no
 * rows, a claim RPC without EXECUTE — each one produces the same symptom from
 * the outside: the phone does not buzz. Nothing in the app said which one it
 * was, so the only way to find out was to read the code and guess.
 *
 * This reports each link separately, so a broken one is named rather than
 * inferred. It is protected by the same `JOBS_SECRET` as the job runner,
 * because the counts are operational data, not public.
 *
 * It never returns a key, an endpoint or a user id — only booleans and counts.
 */
export async function GET(request: Request) {
  const expected = jobsSecretOrNull();
  const headerSecret =
    request.headers.get("x-jobs-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const fromVercelCron = Boolean(request.headers.get("x-vercel-cron"));

  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "JOBS_SECRET is not set, so this endpoint is closed." },
      { status: 503 },
    );
  }
  if (!fromVercelCron && headerSecret !== expected) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const checks: Record<string, unknown> = {
    // 1. The VAPID pair. `pushConfigured()` is true when a private key
    //    resolves; the public half is always present in code.
    vapidConfigured: pushConfigured(),
    vapidPublicKeyLength: VAPID_PUBLIC_KEY.length,

    // 2. The service-role key. Without it the dispatcher cannot read other
    //    users' subscriptions or call the claim RPC, and every send is skipped.
    serviceRoleKey: hasAdminKey,
  };

  if (!hasAdminKey) {
    return NextResponse.json({
      ok: false,
      checks,
      error:
        "SUPABASE_SERVICE_ROLE_KEY is not set. The dispatcher cannot read push_subscriptions, so no push can be sent.",
    });
  }

  const supabase = createAdminClient();

  // 3. Subscriptions: how many devices are reachable at all.
  const { count: subs, error: subsErr } = await supabase
    .from("push_subscriptions")
    .select("id", { count: "exact", head: true });
  checks.subscriptions = subsErr ? `error: ${subsErr.message}` : (subs ?? 0);

  // 4. The outbox: rows waiting to be pushed, and rows already pushed.
  const { count: unpushed, error: unErr } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("pushed_at", null);
  checks.unpushed = unErr ? `error: ${unErr.message}` : (unpushed ?? 0);

  const { count: pushed, error: pErr } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .not("pushed_at", "is", null);
  checks.pushed = pErr ? `error: ${pErr.message}` : (pushed ?? 0);

  // 5. The claim RPC. This is the call that failed silently for a whole
  //    release because sql/0022 revoked EXECUTE and never granted it to
  //    service_role. Probing it with limit 0 proves the grant without
  //    claiming (and therefore without losing) a real notification.
  const { error: rpcErr } = await supabase.rpc("claim_unpushed_notifications", { p_limit: 0 });
  checks.claimRpc = rpcErr ? `error: ${rpcErr.message}` : "ok";

  const healthy =
    checks.vapidConfigured === true &&
    checks.serviceRoleKey === true &&
    checks.claimRpc === "ok" &&
    typeof checks.subscriptions === "number" &&
    checks.subscriptions > 0;

  return NextResponse.json({
    ok: healthy,
    checks,
    // The single most useful sentence: what to fix first.
    hint: healthy
      ? "Push is wired end to end. A device with permission granted and a row in push_subscriptions will receive notifications."
      : checks.subscriptions === 0
        ? "No device has subscribed yet. Open the site, tap 'Turn on notifications' on the notifications page, and allow the prompt."
        : "One of the checks above is failing; fix it first.",
  });
}
