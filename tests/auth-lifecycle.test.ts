/**
 * Auth lifecycle tests — the shared redirect/session chain.
 *
 * Run: npm run test:auth
 *
 * These are unit-level tests over the pure decision logic of the auth
 * chain. They do NOT need Supabase or Firebase credentials, so they run in CI
 * and on a fresh clone.
 *
 * The end-to-end flow (real Firebase token → real Supabase session → real
 * browser) needs a deployed preview and real credentials, and is not covered
 * here.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { safeNextPath } from "../src/lib/safe-next";
import { postAuthDestination } from "../src/lib/post-auth";
import { signedInLanding } from "../src/lib/auth/landing";
import { sellerGatePath, onboardingStepFor, isApprovedSeller } from "../src/lib/seller-gate";
import { isBuyerAccount, isSellerAccount } from "../src/lib/roles";
import { maskEmail, cookieNames } from "../src/lib/auth/redact";

// ── A tiny fake Supabase client ──────────────────────────────────────────────
// `postAuthDestination` only ever calls `.from(table).select().eq().maybeSingle()`,
// so that is all this needs to implement.
function fakeSupabase(tables: {
  profiles?: { role?: string } | null;
  shops?: Record<string, unknown> | null;
}) {
  return {
    from(table: "profiles" | "shops") {
      const row = table === "profiles" ? tables.profiles : tables.shops;
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: row ?? null, error: null }),
      };
      return chain;
    },
  } as never;
}

// ── 1. `next` handling ───────────────────────────────────────────────────────

test("safeNextPath accepts a normal deep link", () => {
  assert.equal(safeNextPath("/orders/42"), "/orders/42");
  assert.equal(safeNextPath("/seller?tab=orders"), "/seller?tab=orders");
});

test("safeNextPath rejects every way back to the auth pages", () => {
  // This is the guard that stops an authenticated user being sent back to the
  // login form by a stale `?next=/auth` in a bookmark or an old email link.
  for (const bad of [
    "/auth",
    "/auth?next=/x",
    "/auth/",
    "/auth/sso-callback",
    "/signin",
    "/signup",
    "/signup/complete",
    "/login",
  ]) {
    assert.equal(safeNextPath(bad), null, `expected ${bad} to be rejected`);
  }
});

test("safeNextPath rejects off-site and normalisation hazards", () => {
  for (const bad of [
    "https://evil.com",
    "//evil.com",
    "/\\evil.com",
    "\\\\evil.com",
    "javascript:alert(1)",
    "/ok\n/../evil",
    "",
    null,
    undefined,
    42,
  ]) {
    assert.equal(safeNextPath(bad as unknown), null, `expected ${String(bad)} to be rejected`);
  }
});

// ── 2. Login destinations ───────────────────────────────────────────────────

test("buyer with no shop lands on the storefront", async () => {
  const dest = await postAuthDestination(
    fakeSupabase({ profiles: { role: "buyer" }, shops: null }),
    "u1",
  );
  assert.equal(dest, "/");
});

test("a buyer with no shop is never routed into the seller area", async () => {
  // The regression this guards: a plain buyer being sent to the Seller Hub.
  const dest = await postAuthDestination(
    fakeSupabase({ profiles: { role: "buyer" }, shops: null }),
    "u1",
  );
  assert.equal(dest, "/");
});

test("shop ownership outranks a stale buyer role (shared rule in roles.ts)", async () => {
  // `isSellerAccount` treats a `shops` row as proof of a seller, so a stale
  // `role = 'buyer'` read cannot strand a real seller on the storefront.
  // NOTE: the comment block in post-auth.ts still claims the opposite
  // ("a buyer is a buyer even if a shops row points at their account"). The
  // code follows roles.ts, which is the shared rule; the comment is stale.
  const dest = await postAuthDestination(
    fakeSupabase({
      profiles: { role: "buyer" },
      shops: { id: "s1", status: "approved", verified: true },
    }),
    "u1",
  );
  assert.equal(dest, "/seller");
});

test("approved seller lands on the Seller Hub", async () => {
  const dest = await postAuthDestination(
    fakeSupabase({
      profiles: { role: "seller" },
      shops: { id: "s1", status: "approved", verified: true, subscription_status: "active" },
    }),
    "u1",
  );
  assert.equal(dest, "/seller");
});

test("seller mid-onboarding lands on the exact onboarding step", async () => {
  // No shop row yet → step 1 (business details).
  assert.equal(
    await postAuthDestination(fakeSupabase({ profiles: { role: "seller" }, shops: null }), "u1"),
    "/seller/onboarding?step=1",
  );

  // Shop exists, bank details missing → step 2 (verification).
  assert.equal(
    await postAuthDestination(
      fakeSupabase({ profiles: { role: "seller" }, shops: { id: "s1", status: "pending" } }),
      "u1",
    ),
    "/seller/onboarding?step=2",
  );

  // Plan paid, awaiting approval → step 4.
  assert.equal(
    await postAuthDestination(
      fakeSupabase({
        profiles: { role: "seller" },
        shops: { id: "s1", status: "pending", subscription_status: "pending", bank_account_number: "0123456789" },
      }),
      "u1",
    ),
    "/seller/onboarding?step=4",
  );
});

test("an explicit safe next wins over the role destination", async () => {
  const dest = await postAuthDestination(
    fakeSupabase({ profiles: { role: "buyer" }, shops: null }),
    "u1",
    "/wishlist",
  );
  assert.equal(dest, "/wishlist");
});

test("an unsafe next is ignored, not followed", async () => {
  const dest = await postAuthDestination(
    fakeSupabase({ profiles: { role: "buyer" }, shops: null }),
    "u1",
    "//evil.com",
  );
  assert.equal(dest, "/");
});

// ── 3. Already-signed-in landing ─────────────────────────────────────────────

test("signedInLanding agrees with postAuthDestination for every role", () => {
  assert.equal(signedInLanding({ profile: { role: "buyer" }, shop: null }), "/");
  assert.equal(
    signedInLanding({ profile: { role: "seller" }, shop: null }),
    "/seller/onboarding?step=1",
  );
  assert.equal(
    signedInLanding({
      profile: { role: "seller" },
      shop: { id: "s1", status: "approved", verified: true },
    }),
    "/seller",
  );
  assert.equal(signedInLanding(null), "/");
});

// ── 4. Seller gate ─────────────────────────────────────────────────────────────

test("only an approved AND verified shop may enter the hub", () => {
  assert.equal(isApprovedSeller({ status: "approved", verified: true }), true);
  assert.equal(isApprovedSeller({ status: "approved", verified: false }), false);
  assert.equal(isApprovedSeller({ status: "pending", verified: true }), false);
  assert.equal(isApprovedSeller(null), false);
});

test("sellerGatePath returns null only for a live seller", () => {
  assert.equal(sellerGatePath({ status: "approved", verified: true }), null);
  assert.equal(sellerGatePath({ status: "approved", verified: false }), "/seller/onboarding?step=4");
  assert.equal(sellerGatePath(null), "/seller/onboarding?step=1");
});

test("onboardingStepFor never asks an approved-but-unverified shop to pay again", () => {
  assert.equal(onboardingStepFor({ status: "approved", verified: false }), 4);
  assert.equal(onboardingStepFor({ status: "rejected" }), 4);
  assert.equal(onboardingStepFor({ status: "suspended" }), 4);
});

// ── 5. Role classification ──────────────────────────────────────────────────

test("a shop owner is a seller even when the role read is stale", () => {
  assert.equal(isSellerAccount({ role: "buyer" }, { id: "s1" }), true);
  assert.equal(isBuyerAccount({ role: "buyer" }, { id: "s1" }), false);
  assert.equal(isBuyerAccount({ role: "buyer" }, null), true);
  assert.equal(isSellerAccount({ role: "admin" }, null), true);
});

// ── 6. Diagnostics never leak secrets ────────────────────────────────────────

test("maskEmail never emits a full address", () => {
  assert.equal(maskEmail("ada@example.com"), "a***@example.com");
  assert.equal(maskEmail(null), "(none)");
  assert.equal(maskEmail("not-an-email"), "***");
  assert.ok(!maskEmail("ada@example.com").includes("ada@"));
});

test("cookieNames returns names only, sorted, never values", () => {
  const cookies = [
    { name: "sb-x-auth-token.1", value: "SECRET-B" },
    { name: "sb-x-auth-token.0", value: "SECRET-A" },
  ];
  const names = cookieNames(cookies);
  assert.deepEqual(names, ["sb-x-auth-token.0", "sb-x-auth-token.1"]);
  assert.ok(!JSON.stringify(names).includes("SECRET"));
});
