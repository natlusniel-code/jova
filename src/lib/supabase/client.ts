"use client";

import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

/**
 * The signed-in user's id, or a clear error.
 *
 * ── Why this exists ───────────────────────────────────────────────────
 * Several components did `const { data: u } = await supabase.auth.getUser()`
 * and then used `u.user!.id`. The `!` is a promise to the compiler that
 * cannot be kept: if the session has not hydrated yet — a hard refresh, a
 * slow cookie, a signed-out tab — `u.user` is null and the next line throws
 * `Cannot read properties of null (reading 'id')`. The user sees a button
 * stuck on "Saving…" and no explanation, because the throw happens inside
 * an async handler with no catch.
 *
 * Returning a result instead of throwing a TypeError means every caller
 * shows a real message.
 */
export async function currentUserId(): Promise<
  { ok: true; id: string } | { ok: false; error: string }
> {
  const supabase = createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    return { ok: false, error: "Your session has expired. Please sign in again." };
  }
  return { ok: true, id: data.user.id };
}

/**
 * Update a row and CONFIRM it actually changed.
 *
 * ── Why `.select()` is not optional ───────────────────────────────────
 * `supabase.from(t).update(v).eq(k, x)` returns `{ error: null }` when RLS
 * filters the row out. Zero rows were written and the call still looks
 * successful. That is exactly how the admin console came to report "saved"
 * for a ban that never landed, and it is the same trap in every seller
 * write: a listing edit that silently does nothing, a status change that
 * reverts on refresh.
 *
 * Chaining `.select()` makes the database return the rows it actually
 * wrote, so "no rows" becomes a visible error instead of a lie.
 */
export async function updateOne<T = Record<string, unknown>>(
  table: string,
  values: Record<string, unknown>,
  match: Record<string, unknown>,
): Promise<{ ok: true; row: T } | { ok: false; error: string }> {
  const supabase = createClient();
  let query = supabase.from(table).update(values).select("*");
  for (const [column, value] of Object.entries(match)) {
    query = query.eq(column, value);
  }
  const { data, error } = await query;
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return {
      ok: false,
      error:
        "That change was not saved. You may not have permission, or the record no longer exists.",
    };
  }
  return { ok: true, row: data[0] as T };
}

/**
 * Upload a file to the public `naijamart` bucket and return its public URL.
 *
 * The extension is derived from the MIME type, not the file name. A phone
 * camera roll can hand over `image` with no extension at all, and a file
 * named `.jpg` can actually be a WebP — either would produce a path whose
 * extension lies about the content, which matters because the bucket has an
 * `allowed_mime_types` list.
 */
const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
};

export async function uploadToBucket(file: File, folder: string) {
  const supabase = createClient();
  const fromName = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "";
  const ext = EXT_BY_MIME[file.type] || (fromName && fromName.length <= 5 ? fromName : "jpg");
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("naijamart").upload(path, file, {
    cacheControl: "31536000",
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from("naijamart").getPublicUrl(path);
  return data.publicUrl;
}
