/**
 * Product Listing Assistant — the BROWSER half.
 *
 * ── The pipeline ──────────────────────────────────────────────────────────
 *  1. The seller types a TITLE. That alone is enough to generate.
 *     A description is optional, and photos are optional for a service but
 *     compulsory for a product.
 *  2. Every photo is downscaled in the browser (canvas) and uploaded to the
 *     public `naijamart` bucket; public URLs come back.
 *  3. Title + description (when given) + the downscaled photos are POSTed to
 *     `/api/ai/listing`, which calls Gemini server-side and returns the
 *     listing copy plus six banner art-direction prompts.
 *  4. The six prompts are shown to the seller and can be copied all at once
 *     with a single action — they are not rendered into images here.
 *
 * ── Where the Gemini key lives now ────────────────────────────────────────
 * NOT here. This module is imported by a Client Component, so everything in
 * it ships to the browser — which is exactly how the key used to leak. The
 * key, the prompt and the model call now live in `ai-listing-server.ts`
 * (behind `import "server-only"`) and are reached through the
 * `/api/ai/listing` route.
 *
 * What stays here is only what the browser legitimately needs: the constants,
 * the types, the canvas downscaler, the JSON parser and the copy helpers.
 * `generateListing()` and `regenerateField()` keep their exact signatures and
 * now POST to the route, so the panel component did not have to change.
 */

/* ------------------------------------------------------------------ config */

/**
 * How long the browser waits for the route before giving up.
 *
 * The route itself allows 15 s on the primary model and 60 s on the fallback,
 * so the client bound has to sit above both or it would abort a request the
 * server was about to answer.
 */
export const REQUEST_TIMEOUT_MS = 75_000;

/** Upload limit per photo, checked before anything is read or resized. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** Longest edge after downscaling. Keeps the request small and fast. */
export const MAX_EDGE = 1600;

/** How many photos a listing may use. */
export const MAX_PHOTOS = 6;

/**
 * Minimum characters of a listing title before the button unlocks.
 *
 * The title is the one input that is always required — it is what the model
 * is asked to expand. The description is optional for both kinds, and photos
 * are optional for a service, so neither of those gates the button.
 */
export const MIN_TITLE_CHARS = 3;

/** The two listing kinds the assistant writes for. */
export type ListingKind = "product" | "service";

/** Accepted input types. */
export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** The bucket every product photo is uploaded to. It is public by design. */
export const STORAGE_BUCKET = "naijamart";

/* ------------------------------------------------------------- banner specs */

export type BannerType =
  | "Hero"
  | "Lifestyle"
  | "Feature close-up"
  | "Sale"
  | "Social square"
  | "Story";

/**
 * The six banner slots and the frame each one is described for.
 *
 * These are the sizes the brief specifies. The prompts are handed to the
 * seller to render elsewhere, so the width/height here are the art-direction
 * target each prompt should describe.
 */
export const BANNER_SPECS: { type: BannerType; width: number; height: number; label: string }[] = [
  { type: "Hero", width: 1200, height: 675, label: "16:9" },
  { type: "Lifestyle", width: 1200, height: 800, label: "3:2" },
  { type: "Feature close-up", width: 1000, height: 1000, label: "1:1" },
  { type: "Sale", width: 1200, height: 628, label: "1.91:1" },
  { type: "Social square", width: 1080, height: 1080, label: "1:1" },
  { type: "Story", width: 1080, height: 1920, label: "9:16" },
];

export const BANNER_TYPES = BANNER_SPECS.map((b) => b.type);

/* ------------------------------------------------------------------- types */

export type BannerPrompt = { type: string; prompt: string };

export type GeneratedListing = {
  title: string;
  shortDescription: string;
  longDescription: string;
  tags: string[];
  bannerPrompts: BannerPrompt[];
};

export type PreparedImage = {
  /** `data:image/jpeg;base64,…` — for the preview thumbnail. */
  dataUrl: string;
  /** Bare base64, no prefix — what `inline_data.data` wants. */
  base64: string;
  mimeType: string;
  width: number;
  height: number;
  /** Bytes after downscaling, for the "we shrank it" note. */
  bytes: number;
};

/** A failure the UI can turn into a sentence. */
export class AiListingError extends Error {
  code:
    | "bad_key"
    | "rate_limit"
    | "bad_model"
    | "network"
    | "bad_json"
    | "too_large"
    | "bad_type"
    | "no_image"
    | "empty_response"
    | "upload"
    | "not_signed_in"
    | "not_premium";
  constructor(code: AiListingError["code"], message: string) {
    super(message);
    this.name = "AiListingError";
    this.code = code;
  }
}

/* ------------------------------------------------------------- image prep */

/**
 * Read a file, downscale it to `MAX_EDGE`, and return base64.
 *
 * Downscaling is not cosmetic: a modern phone photo is 4–8 MB and 4000px
 * wide, which is both over the upload limit and far more detail than the
 * model needs to name a product. 1600px on the longest edge keeps texture
 * legible while cutting the payload by roughly 10×.
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!ACCEPTED_TYPES.includes(file.type as (typeof ACCEPTED_TYPES)[number])) {
    throw new AiListingError(
      "bad_type",
      "That file type is not supported. Use a JPEG, PNG or WebP photo.",
    );
  }
  if (file.size > MAX_FILE_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    throw new AiListingError(
      "too_large",
      `That photo is ${mb} MB. The limit is 5 MB — try a smaller one or take the photo again at a lower resolution.`,
    );
  }

  const bitmap = await loadBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new AiListingError("no_image", "This browser could not process the photo. Try another one.");
  }
  // White behind the image: a transparent PNG flattened onto black would
  // make a pale product look like it is floating in a void.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  if ("close" in bitmap && typeof bitmap.close === "function") bitmap.close();

  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);

  return {
    dataUrl,
    base64,
    mimeType: "image/jpeg",
    width,
    height,
    bytes: Math.round((base64.length * 3) / 4),
  };
}

/** Decode a file to something drawable, preferring the faster API. */
async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      /* fall through to the <img> path */
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new AiListingError("no_image", "That photo could not be opened. Try a different file."));
    };
    img.src = url;
  });
}

/** Fetch a public URL and return bare base64 — used to regenerate after a refresh. */
export async function urlToBase64(url: string): Promise<{ base64: string; mimeType: string }> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new AiListingError("upload", "That photo could not be reloaded. Upload it again.");
  const blob = await res.blob();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new AiListingError("upload", "That photo could not be reloaded."));
    fr.readAsDataURL(blob);
  });
  return {
    base64: dataUrl.slice(dataUrl.indexOf(",") + 1),
    mimeType: blob.type || "image/jpeg",
  };
}

/* ------------------------------------------------------------------ parse */

/**
 * Turn the model's text into a `GeneratedListing`.
 *
 * `responseMimeType: "application/json"` makes the model return bare JSON,
 * but it is not a guarantee — a stray ```json fence or a trailing comma
 * still happens. So the fences are stripped and, if `JSON.parse` fails, the
 * outermost `{…}` is extracted and tried once more before giving up.
 */
export function parseListing(raw: string): GeneratedListing {
  const cleaned = raw
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end <= start) {
      throw new AiListingError("bad_json", "The AI returned something we could not read. Please try again.");
    }
    try {
      parsed = JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      throw new AiListingError("bad_json", "The AI returned something we could not read. Please try again.");
    }
  }

  if (!parsed || typeof parsed !== "object") {
    throw new AiListingError("bad_json", "The AI returned something we could not read. Please try again.");
  }

  const title = String(parsed.title ?? "").trim();
  if (!title) {
    throw new AiListingError("bad_json", "The AI did not return a title. Please try again.");
  }

  // Tags: lowercase, trimmed, de-duplicated, capped at 15. The database
  // normalises the same way (sql/0015), so what the seller sees is what is
  // stored and searched.
  const tags: string[] = Array.isArray(parsed.tags)
    ? Array.from(
        new Set<string>(
          parsed.tags.map((t: any) => String(t ?? "").trim().toLowerCase()).filter(Boolean),
        ),
      ).slice(0, 15)
    : [];

  // Banners: keep the six known slots in the brief's order, and fill any the
  // model skipped with an empty prompt so the grid is always six frames.
  const byType = new Map<string, string>();
  if (Array.isArray(parsed.bannerPrompts)) {
    for (const b of parsed.bannerPrompts) {
      const type = String(b?.type ?? "").trim();
      const prompt = String(b?.prompt ?? "").trim();
      if (type && prompt) byType.set(type.toLowerCase(), prompt);
    }
  }
  const bannerPrompts: BannerPrompt[] = BANNER_TYPES.map((type) => ({
    type,
    prompt: byType.get(type.toLowerCase()) ?? "",
  }));

  return {
    title: title.slice(0, 60),
    shortDescription: String(parsed.shortDescription ?? "").trim(),
    longDescription: String(parsed.longDescription ?? "").trim(),
    tags,
    bannerPrompts,
  };
}

/* ------------------------------------------------------------------- api */

/**
 * POST to the server route and turn its answer into a value or a sentence.
 *
 * The route is the only place that holds the key. It answers with
 * `{ ok: true, ... }` or `{ ok: false, code, error }`, and this helper maps
 * the failure onto an `AiListingError` so the panel's existing `catch` keeps
 * working unchanged.
 */
async function postToRoute<T>(
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const onExternalAbort = () => controller.abort();
  signal?.addEventListener("abort", onExternalAbort);

  try {
    const res = await fetch("/api/ai/listing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    let payload: any = null;
    try {
      payload = await res.json();
    } catch {
      /* a non-JSON body is handled below */
    }

    if (!res.ok || !payload?.ok) {
      const code = (payload?.code ?? "network") as AiListingError["code"];
      const message =
        payload?.error ??
        (res.status === 401
          ? "Sign in to use the AI assistant."
          : res.status === 403
            ? "The AI assistant is a Premium feature."
            : res.status === 429
              ? "Rate limit reached. Please wait a moment and try again."
              : "Could not reach the AI service. Check your connection and retry.");
      throw new AiListingError(code, message);
    }

    return payload.data as T;
  } catch (e: any) {
    if (e instanceof AiListingError) throw e;
    if (e?.name === "AbortError") {
      if (signal?.aborted) throw e;
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
    signal?.removeEventListener("abort", onExternalAbort);
  }
}

/**
 * Generate a whole listing from a title, an optional description and any
 * photos the seller supplied.
 *
 * ── What is required, and why ─────────────────────────────────────────────
 * The TITLE is the only compulsory input: it is what the model expands, and
 * a seller who knows what they are selling can always type it. The
 * description is optional for both kinds. Photos are optional for a service
 * (a plumber has no product shot) but COMPULSORY for a product — a product
 * listing with no picture is not a listing a buyer can trust, and the
 * product prompt's whole job is to read the item from its photos.
 *
 * The checks are repeated on the server; these exist so the seller gets the
 * sentence instantly instead of after a round trip.
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

  return postToRoute<GeneratedListing>(
    { action: "generate", kind, title, details: details ?? "", images },
    signal,
  );
}

export type RegenerateField = "title" | "shortDescription" | "longDescription" | "tags";

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
  return postToRoute<string | string[]>(
    { action: "regenerate", field, kind, title, details: details ?? "", images, context },
    signal,
  );
}

/* ------------------------------------------------------------ banner prompts */

/**
 * All six banner prompts as one block of text, for a single "Copy all" action.
 *
 * Each prompt is prefixed with its slot name so the seller can tell them
 * apart after pasting. The six slots always appear in the brief's order.
 */
export function bannerPromptsToText(l: GeneratedListing): string {
  return l.bannerPrompts
    .map((b) => `${b.type}\n${b.prompt}`)
    .join("\n\n");
}

/* ------------------------------------------------------------------ misc */

/** The whole listing as plain text, for "Copy all". */
export function listingToText(l: GeneratedListing): string {
  return [
    `TITLE\n${l.title}`,
    `SHORT DESCRIPTION\n${l.shortDescription}`,
    `LONG DESCRIPTION\n${l.longDescription}`,
    `TAGS\n${l.tags.join(", ")}`,
  ].join("\n\n");
}

/** Copy to the clipboard, with a fallback for browsers that block the API. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
