/**
 * Deterministic pseudo-randomness, seeded by a string.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 * The storefront shows three verified sellers. "Random" there cannot mean
 * `Math.random()`: the home page is a Server Component rendered on every
 * request, so a fresh random pick would reshuffle the three cards on every
 * navigation and every refresh. A buyer who taps a shop, comes back, and
 * finds a different row has lost their place — the section stops being a
 * shelf and becomes a slot machine.
 *
 * What the product actually wants is: **stable for one account, different
 * between accounts.** Two buyers should not see the same three shops (that
 * would just be a fixed list with extra steps), but one buyer should see the
 * same three until the seed changes.
 *
 * So the seed is the account id. Same account → same shuffle → same three
 * shops. Different account → different shuffle. No storage, no column, no
 * migration: the ordering is recomputed from the id each time.
 *
 * ── Why not `ORDER BY random()` in SQL ─────────────────────────────────────
 * `random()` is re-evaluated per row per query, so it is random per *request*,
 * not per *user* — exactly the reshuffling problem above. A seeded hash
 * ordering would need an RPC and a migration; this needs neither, and the
 * candidate set (ids of verified shops) is small enough to shuffle in memory.
 */

/** FNV-1a, 32-bit. Small, fast, and good enough to spread ids across seeds. */
function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    // h *= 16777619, kept in 32-bit range without overflowing the float mantissa
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — a tiny, well-distributed 32-bit PRNG. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher–Yates shuffle driven by a seeded PRNG.
 *
 * Returns a NEW array; the input is not mutated. With the same `seed` and the
 * same input order the result is always identical, which is what makes the
 * storefront stable per account.
 */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const out = items.slice();
  const rand = mulberry32(hashString(seed));
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

/**
 * A stable seed for a visitor with no account.
 *
 * An anonymous visitor has no id to key on, so we derive one from what the
 * request already carries. It is hashed and never stored, so it identifies a
 * browser session well enough to keep the row steady across a few page loads
 * without recording anything about the person.
 *
 * `fallback` is used when the request carries nothing distinguishing (a bare
 * health check, a bot) — a fixed string keeps the output deterministic rather
 * than throwing.
 */
export function anonymousSeed(parts: (string | null | undefined)[], fallback = "anonymous"): string {
  const joined = parts.filter(Boolean).join("|");
  return joined ? `anon:${hashString(joined).toString(36)}` : fallback;
}
