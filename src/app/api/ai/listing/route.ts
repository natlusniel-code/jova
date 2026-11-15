import { NextResponse } from "next/server";
import { getSession } from "@/lib/supabase/server";
import { shopHasFeature } from "@/lib/plan-gate";
import { rateLimit } from "@/lib/rate-limit";
import { AiListingError, type GeneratedListing, type ListingKind, type RegenerateField } from "@/lib/ai-listing";
import {
  FALLBACK_TIMEOUT_MS,
  PRIMARY_TIMEOUT_MS,
  generateListing,
  listingAiConfigured,
  regenerateField,
} from "@/lib/ai-listing-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/ai/listing
 *
 * The only place the Gemini key is used for the listing assistant.
 *
 * ── Why a route and not a Server Action ───────────────────────────────────
 * The browser already downscales each photo to 1600px, but six of them are
 * still a few hundred KB of base64. A plain POST sends that as JSON without
 * React's action serialisation, and it is the same shape the search route
 * already uses — one pattern to reason about.
 *
 * ── Why the checks are here and not only in the panel ─────────────────────
 * The panel hides the feature from a Basic seller, but hiding a button is not
 * a gate: anyone can POST to this URL. So the route re-establishes, in order:
 *
 *   1. there is a session (401 otherwise),
 *   2. the caller owns a shop (403),
 *   3. that shop's plan includes `aiListing` (403),
 *   4. the caller is under the per-user rate limit (429).
 *
 * Only then does it touch the model. The key never leaves this process.
 */

type Body = {
  action?: "generate" | "regenerate";
  kind?: ListingKind;
  title?: string;
  details?: string;
  images?: { base64: string; mimeType: string }[];
  field?: RegenerateField;
  context?: GeneratedListing;
};

/** A failure the client can render, with the code its `AiListingError` expects. */
function fail(code: string, error: string, status: number) {
  return NextResponse.json({ ok: false, code, error }, { status });
}

/** Keep only well-formed image parts, and cap the count and the payload. */
function cleanImages(input: unknown): { base64: string; mimeType: string }[] {
  if (!Array.isArray(input)) return [];
  const out: { base64: string; mimeType: string }[] = [];
  for (const raw of input.slice(0, 6)) {
    const base64 = String((raw as any)?.base64 ?? "");
    const mimeType = String((raw as any)?.mimeType ?? "image/jpeg");
    if (!base64) continue;
    // A 1600px JPEG is ~200–400 KB; anything past 2 MB per photo is not a
    // downscaled upload and would only slow the model call down.
    if (base64.length > 2_800_000) continue;
    out.push({ base64, mimeType });
  }
  return out;
}

export async function POST(request: Request) {
  try {
    /* ── 1. session ─────────────────────────────────────────────────────── */
    const session = await getSession();
    if (!session) {
      return fail("not_signed_in", "Sign in to use the AI assistant.", 401);
    }

    /* ── 2. the caller must own a shop ──────────────────────────────────── */
    const shop = session.shop;
    if (!shop?.id) {
      return fail("not_premium", "The AI assistant is available to sellers only.", 403);
    }

    /* ── 3. the plan must include the feature ───────────────────────────── */
    const allowed = await shopHasFeature(shop.id, "aiListing");
    if (!allowed) {
      return fail(
        "not_premium",
        "The AI listing assistant is a Premium feature. Upgrade your plan to use it.",
        403,
      );
    }

    /* ── 4. per-user rate limit ─────────────────────────────────────────── */
    // A generation is one model call; a regenerate is one more. 20 a minute
    // is far more than a seller can press, and stops a script from draining
    // the quota on a paying account.
    const rl = rateLimit(`ai-listing:${session.user.id}`, 20, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        {
          ok: false,
          code: "rate_limit",
          error: "You are generating very fast. Give it a moment and try again.",
        },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
      );
    }

    /* ── 5. the key must exist ──────────────────────────────────────────── */
    if (!listingAiConfigured()) {
      return fail(
        "bad_key",
        "The AI service is not configured on this server. Add GEMINI_API_KEY and redeploy.",
        503,
      );
    }

    const body = (await request.json()) as Body;
    const kind: ListingKind = body.kind === "service" ? "service" : "product";
    const title = String(body.title ?? "").trim();
    const details = String(body.details ?? "");
    const images = cleanImages(body.images);

    if (body.action === "regenerate") {
      const field = body.field;
      if (!field || !["title", "shortDescription", "longDescription", "tags"].includes(field)) {
        return fail("bad_json", "Unknown field to regenerate.", 400);
      }
      if (!body.context) {
        return fail("bad_json", "The current listing is required to regenerate a field.", 400);
      }

      const value = await regenerateField({
        field,
        kind,
        title,
        details,
        images,
        context: body.context,
      });
      return NextResponse.json({ ok: true, data: value });
    }

    const listing = await generateListing({ kind, title, details, images });
    return NextResponse.json({ ok: true, data: listing });
  } catch (e: any) {
    if (e instanceof AiListingError) {
      // A model-side failure is not a server bug: 429 for quota, 400 for a
      // rejected key or unreadable answer, 502 for a dead upstream.
      const status =
        e.code === "rate_limit" ? 429 : e.code === "bad_key" ? 400 : e.code === "no_image" ? 400 : 502;
      return fail(e.code, e.message, status);
    }
    console.error("[api/ai/listing] unexpected failure:", e);
    return fail("network", "Could not reach the AI service. Please try again.", 502);
  }
}

/** Exported so a future health check can report the configured budgets. */
const AI_LISTING_BUDGETS = {
  primaryMs: PRIMARY_TIMEOUT_MS,
  fallbackMs: FALLBACK_TIMEOUT_MS,
};
void AI_LISTING_BUDGETS;
