/**
 * The SERVER half of the AI listing assistant.
 *
 * ── Why this file exists ──────────────────────────────────────────────────
 * `ai-listing.ts` is imported by a Client Component, so anything in it ships
 * to the browser. The Gemini key used to live there, split into two string
 * halves to dodge GitHub's push protection — which kept the scanner quiet but
 * still put a working key in every visitor's bundle.
 *
 * The key now lives here, behind `import "server-only"`. Next.js fails the
 * build if a Client Component ever imports this module, so the key cannot
 * leak back into the bundle by accident.
 *
 * ── What stayed in `ai-listing.ts` ────────────────────────────────────────
 * Everything the browser legitimately needs: the constants, the types, the
 * canvas downscaler (`prepareImage`), the JSON parser, the copy helpers. The
 * browser still does the resizing — that is the whole point of doing it
 * client-side — and then posts the already-small base64 to `/api/ai/listing`.
 *
 * ── The key ───────────────────────────────────────────────────────────────
 * Read from `GEMINI_API_KEY` first, then `NEXT_PUBLIC_GEMINI_KEY`. The second
 * name is the variable the deployment already has, so the site keeps working
 * before the new one is added in Vercel. `NEXT_PUBLIC_` is a misleading name
 * for a secret, but reading it here does NOT expose it: this module is
 * server-only, so the value is never inlined into a client bundle. Once
 * `GEMINI_API_KEY` is set, the old variable can be deleted.
 */

import "server-only";

import {
  AiListingError,
  BANNER_TYPES,
  MIN_TITLE_CHARS,
  parseListing,
  type GeneratedListing,
  type ListingKind,
  type RegenerateField,
} from "@/lib/ai-listing";

/* ------------------------------------------------------------------ config */

/**
 * The key.
 *
 * `GEMINI_API_KEY` wins. `NEXT_PUBLIC_GEMINI_KEY` is the fallback so a host
 * that has not been updated yet still works — the build must not break just
 * because only the old variable is present.
 */
export const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY?.trim() || process.env.NEXT_PUBLIC_GEMINI_KEY?.trim() || "";

/** True when a key is configured at all. */
export function listingAiConfigured(): boolean {
  return GEMINI_API_KEY.length > 0;
}

/** Primary model, as the brief names it. */
export const GEMINI_MODEL = "gemini-flash-latest";

/**
 * Fallback model.
 *
 * `gemini-flash-latest` is a moving alias and during demand spikes it either
 * 503s or accepts the request and never answers. A timeout, 503 or 429 on the
 * primary is retried once on the lite model. A 400/403 is NOT retried — those
 * are about the key, and the lite model would fail identically.
 */
const FALLBACK_MODEL = "gemini-flash-lite-latest";

/**
 * How long to wait for one Gemini attempt.
 *
 * The primary gets a SHORT budget: it does not fail fast when overloaded, it
 * accepts the connection and then never answers. 15 s is comfortably more
 * than the 3–8 s a healthy response takes, and short enough that a hung
 * request is abandoned while the seller is still watching. The fallback then
 * gets the full 60 s, because by then it is the only attempt left.
 */
export const PRIMARY_TIMEOUT_MS = 15_000;
export const FALLBACK_TIMEOUT_MS = 60_000;

/* ------------------------------------------------------------------ prompt */

/**
 * The instruction sent with the seller's inputs.
 *
 * ── Why this branches on `kind` ───────────────────────────────────────────
 * A product and a service need different copy AND different banner art
 * direction, so one prompt cannot serve both:
 *
 *   PRODUCT  the six prompts must describe ONE product campaign with the
 *            same product, palette, lighting and styling in every frame, so
 *            the six images look like a set. The FIRST prompt must ask for
 *            text to appear on that image (the hero carries the headline).
 *
 *   SERVICE  the six prompts must describe a graphics-design GIG FLYER for
 *            the service being sold — the kind of flyer a designer posts to
 *            advertise "logo design" or "plumbing service". Each prompt must
 *            carry the service name, the listing title and a short note, and
 *            the result must read as a flyer, not a product photo.
 */
export function buildPrompt({
  kind,
  title,
  details,
  hasPhotos,
}: {
  kind: ListingKind;
  title: string;
  details: string;
  hasPhotos: boolean;
}): string {
  const shape = `{
  "title": "max 60 characters, SEO friendly",
  "shortDescription": "1-2 sentences",
  "longDescription": "3 short paragraphs separated by \\n\\n",
  "tags": ["10-15 lowercase keywords"],
  "bannerPrompts": [
    { "type": "Hero", "prompt": "..." },
    { "type": "Lifestyle", "prompt": "..." },
    { "type": "Feature close-up", "prompt": "..." },
    { "type": "Sale", "prompt": "..." },
    { "type": "Social square", "prompt": "..." },
    { "type": "Story", "prompt": "..." }
  ]
}`;

  const landscape = `IMPORTANT — every banner is a fixed horizontal (landscape) frame of the same size: 1200x630 pixels, aspect ratio 1.91:1. All six banner prompts must describe that same landscape frame, must all state the same aspect ratio (1.91:1), and must never ask for a square, portrait or vertical crop. Leave clear empty space for text in the same region of every frame.`;

  const sellerInput = [
    `Listing title: ${title.trim()}`,
    details.trim() ? `Seller's description: ${details.trim()}` : "",
    hasPhotos
      ? "Photos of the item are attached — use them as the source of truth for what it looks like."
      : "No photos were supplied — work only from the title and description above, and do not invent visual details you cannot justify.",
  ]
    .filter(Boolean)
    .join("\n");

  if (kind === "service") {
    return `You are an expert marketplace copywriter and graphic designer. You are writing a listing for a SERVICE (a gig) on NaijaMart, a Nigerian marketplace. The seller may have supplied only a title, or a title plus a short description of the service, and may or may not have attached photos.

Return ONLY valid JSON in exactly this shape:
${shape}

Write the listing copy for the SERVICE: what the seller does, who it is for, what the buyer receives, and why they should book it. Do not invent a price, a delivery time or a guarantee that the seller did not state.

── The six banner prompts are GIG FLYERS ──
Each of the six prompts must describe a graphics-design GIG FLYER advertising this service — the kind of promotional flyer a designer makes to sell "logo creation", "plumbing service", "event photography" and so on. Every prompt must:
- describe a flyer layout (headline block, supporting text block, imagery or icon area, contact/CTA strip), not a plain product photograph;
- state the SERVICE NAME and the LISTING TITLE as text that must appear on the flyer;
- include a short supporting note line (a one-line benefit or offer) as text on the flyer;
- specify the visual style, colour palette, typography feel, background and composition;
- keep the same brand look across all six so they read as one flyer set in different formats;
- leave the text areas clear and legible — the flyer must look finished, not like a photo with words dropped on it.

The first prompt (Hero) must be the primary flyer: the service name and title large and unmistakable.

${landscape}

${sellerInput}`;
  }

  return `You are an expert ecommerce copywriter. You are writing a listing for a PRODUCT on NaijaMart, a Nigerian marketplace. You are given the seller's title, an optional description, and optionally several photos of the same product. Use ALL the photos together to understand the product accurately — its shape, material, colour, size, details and finish. The seller's description is the source of truth for facts you cannot see. Then return ONLY valid JSON in exactly this shape:
${shape}

Each banner prompt must describe the product accurately using what you saw in the photos (or the title and description when there are none), and must specify: subject, background, lighting, composition, aspect ratio, and where empty space is left for text. Do not invent facts that are not visible in the photos or stated in the seller's description.

── The six banner prompts must be ONE consistent set ──
All six prompts describe the SAME product in the SAME visual world, so the six images look like a campaign rather than six unrelated pictures. Every prompt must repeat the same:
- product appearance (shape, colour, material, finish, any visible branding);
- colour palette and background treatment;
- lighting setup and mood;
- styling and props (or explicitly "no props");
- photographic style (e.g. clean studio, warm lifestyle, flat lay).
Only the framing, the angle and the purpose of each slot may change.

── The FIRST prompt must call for text on the image ──
The Hero prompt must explicitly ask for text to appear ON that image: the product name or the listing title as a headline, set legibly in the empty space, in a style that matches the palette. The other five prompts may leave their text space empty.

${landscape}

${sellerInput}`;
}

/* --------------------------------------------------------------- transport */

type CallOptions = {
  images: { base64: string; mimeType: string }[];
  prompt: string;
  signal?: AbortSignal;
  /** Per-attempt budget. The primary gets a short one, the fallback a long one. */
  timeoutMs?: number;
};

/**
 * One request to one model, with a hard timeout.
 *
 * The timeout is enforced with `AbortController` rather than by trusting the
 * network: a stalled connection can otherwise hang a `fetch` for minutes.
 */
async function callModel(model: string, opts: CallOptions): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? FALLBACK_TIMEOUT_MS);
  const onExternalAbort = () => controller.abort();
  opts.signal?.addEventListener("abort", onExternalAbort);

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-goog-api-key": GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: opts.prompt },
                // Every photo is its own inline_data part, after the text.
                ...opts.images.map((img) => ({
                  inline_data: { mime_type: img.mimeType, data: img.base64 },
                })),
              ],
            },
          ],
          generationConfig: { responseMimeType: "application/json" },
        }),
        signal: controller.signal,
      },
    );

    if (!res.ok) {
      // Read the body for the real reason — Google puts a useful `message`
      // in it, and "400" alone tells the seller nothing.
      let detail = "";
      try {
        const body = await res.json();
        detail = body?.error?.message ?? "";
      } catch {
        /* non-JSON error body */
      }
      throw httpError(res.status, detail);
    }

    const data = await res.json();
    const parts = data?.candidates?.[0]?.content?.parts;
    // Join every text part: the model sometimes emits a thought part first,
    // and taking parts[0] blindly would return an empty string.
    const text = Array.isArray(parts)
      ? parts.map((p: any) => (typeof p?.text === "string" ? p.text : "")).join("").trim()
      : "";

    if (!text) {
      const reason = data?.candidates?.[0]?.finishReason;
      throw new AiListingError(
        "empty_response",
        reason === "SAFETY"
          ? "The AI could not describe these photos. Try clearer product shots."
          : "The AI returned an empty answer. Please try again.",
      );
    }
    return text;
  } catch (e: any) {
    if (e instanceof AiListingError) throw e;
    if (e?.name === "AbortError") {
      // Distinguish "the seller pressed Cancel" from "we gave up waiting".
      if (opts.signal?.aborted) throw e;
      throw new AiListingError(
        "network",
        "The AI service took too long to answer. Check your connection and try again.",
      );
    }
    throw new AiListingError(
      "network",
      "Could not reach the AI service. Check your connection and retry.",
    );
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onExternalAbort);
  }
}

/** Map an HTTP status to the sentence the brief specifies. */
function httpError(status: number, detail: string): AiListingError {
  if (status === 400 || status === 403) {
    return new AiListingError("bad_key", "The API key was rejected. Check the key in the config.");
  }
  if (status === 429) {
    return new AiListingError("rate_limit", "Rate limit reached. Please wait a moment and try again.");
  }
  if (status === 404) {
    return new AiListingError("bad_model", "The model name is not available. Use gemini-flash-latest.");
  }
  if (status === 503) {
    // A demand spike, not a bad request — worth one retry on the fallback.
    return new AiListingError("network", "The AI service is busy right now. Please try again in a moment.");
  }
  return new AiListingError(
    "network",
    detail
      ? `The AI service returned an error: ${detail}`
      : "Could not reach the AI service. Check your connection and retry.",
  );
}

/**
 * Call the primary model, then the fallback on a timeout, 503 or 429.
 *
 * Quota is per MODEL, not per key, so a 429 on the primary is retried once on
 * the fallback. A 400/403/404 is not retried: a rejected key or a bad model
 * name fails identically on both.
 */
async function callGemini(opts: CallOptions): Promise<string> {
  try {
    return await callModel(GEMINI_MODEL, { ...opts, timeoutMs: PRIMARY_TIMEOUT_MS });
  } catch (e: any) {
    const retryable =
      e instanceof AiListingError &&
      (e.code === "network" || e.code === "empty_response" || e.code === "rate_limit");
    if (!retryable || opts.signal?.aborted) throw e;
    return await callModel(FALLBACK_MODEL, { ...opts, timeoutMs: FALLBACK_TIMEOUT_MS });
  }
}

/* ------------------------------------------------------------------- api */

/**
 * Generate a whole listing from a title, an optional description and any
 * photos the seller supplied.
 *
 * The TITLE is the only compulsory input. The description is optional for
 * both kinds. Photos are optional for a service but COMPULSORY for a product.
 */
export async function generateListing({
  kind,
  title,
  details,
  images,
  signal,
}: {
  kind: ListingKind;
  title: string;
  details?: string;
  images: { base64: string; mimeType: string }[];
  signal?: AbortSignal;
}): Promise<GeneratedListing> {
  if (title.trim().length < MIN_TITLE_CHARS) {
    throw new AiListingError("bad_json", "Add a title first.");
  }
  if (kind === "product" && !images.length) {
    throw new AiListingError("no_image", "Add at least one product photo first.");
  }
  const raw = await callGemini({
    images,
    prompt: buildPrompt({
      kind,
      title,
      details: details ?? "",
      hasPhotos: images.length > 0,
    }),
    signal,
  });
  return parseListing(raw);
}

/**
 * Ask for a second take on ONE field.
 *
 * Sending the whole listing prompt again would rewrite everything and throw
 * away the parts the seller already liked, so this asks for a single value
 * in a tiny JSON envelope. `context` is the current listing, which keeps the
 * new title consistent with the description the seller kept.
 */
export async function regenerateField({
  field,
  kind,
  title,
  images,
  details,
  context,
  signal,
}: {
  field: RegenerateField;
  kind: ListingKind;
  title: string;
  images: { base64: string; mimeType: string }[];
  details?: string;
  context: GeneratedListing;
  signal?: AbortSignal;
}): Promise<string | string[]> {
  const shape =
    field === "tags" ? `{"value": ["10-15 lowercase keywords"]}` : `{"value": "the new text"}`;

  const noun = kind === "service" ? "service" : "product";

  const what =
    field === "title"
      ? `a different ${noun} title, max 60 characters, SEO friendly`
      : field === "shortDescription"
        ? "a different short description, 1-2 sentences"
        : field === "longDescription"
          ? "a different long description, 3 short paragraphs separated by \\n\\n, benefit-led"
          : "a different set of 10-15 lowercase search keywords";

  const prompt = `You are an expert marketplace copywriter. Write ${what} for this ${noun} listing.

The listing already says:
- Title: ${context.title}
- Short description: ${context.shortDescription}
- Tags: ${context.tags.join(", ")}

Keep it consistent with that listing but do not repeat it word for word. Do not invent facts that are not stated by the seller or visible in the photos.

Return ONLY valid JSON in exactly this shape: ${shape}

Listing title: ${title.trim()}
${details?.trim() ? `Seller's description: ${details.trim()}` : "The seller gave no description."}`;

  const raw = await callGemini({ images, prompt, signal });
  const cleaned = raw
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const s = cleaned.indexOf("{");
    const e = cleaned.lastIndexOf("}");
    try {
      parsed = JSON.parse(cleaned.slice(s, e + 1));
    } catch {
      throw new AiListingError("bad_json", "The AI returned something we could not read. Please try again.");
    }
  }

  const value = parsed?.value;
  if (field === "tags") {
    if (!Array.isArray(value)) {
      throw new AiListingError("bad_json", "The AI did not return tags. Please try again.");
    }
    return Array.from(
      new Set(value.map((t: any) => String(t ?? "").trim().toLowerCase()).filter(Boolean)),
    ).slice(0, 15);
  }

  const text = String(value ?? "").trim();
  if (!text) {
    throw new AiListingError("bad_json", "The AI returned an empty answer. Please try again.");
  }
  return field === "title" ? text.slice(0, 60) : text;
}

/** Re-exported so the route can validate the six slots without a second import. */
export { BANNER_TYPES };
