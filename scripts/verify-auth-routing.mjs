/**
 * Routing acceptance test for the auth flow.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * The four acceptance cases in the bug report are all "where does this person
 * land?" questions, and the answer is computed by two functions:
 * `postAuthDestination` (after a sign-in) and `signedInLanding` (when an
 * already-signed-in visitor opens /auth or /signup). Both take a Supabase
 * client, so this script hands them a fake one that returns a chosen profile
 * and shop row — no database, no network, no Clerk keys.
 *
 * It is a real check of the real code: the modules are transpiled from `src/`
 * with sucrase (already a dependency), not re-implemented here. If someone
 * changes the rule, this fails.
 *
 * Run: node scripts/verify-auth-routing.mjs
 */
import { transform } from "sucrase";
import { readFile, writeFile, mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { pathToFileURL } from "node:url";

const out = await mkdtemp(join(tmpdir(), "jova-routing-"));

/**
 * Transpile one source file and its local imports into the temp dir, so the
 * `@/…` alias and relative imports both resolve.
 */
async function transpile(rel, seen = new Set()) {
  if (seen.has(rel)) return;
  seen.add(rel);

  const src = await readFile(rel, "utf8");

  // Follow local imports so the bundle is complete.
  const importRe = /from\s+["']([^"']+)["']/g;
  for (const m of src.matchAll(importRe)) {
    const spec = m[1];
    if (spec.startsWith("@/")) {
      const base = join("src", spec.slice(2));
      for (const cand of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
        try {
          await readFile(cand, "utf8");
          await transpile(cand, seen);
          break;
        } catch {
          /* try the next candidate */
        }
      }
    } else if (spec.startsWith(".")) {
      const base = join(dirname(rel), spec);
      for (const cand of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
        try {
          await readFile(cand, "utf8");
          await transpile(cand, seen);
          break;
        } catch {
          /* try the next candidate */
        }
      }
    }
  }

  const code = transform(src, {
    transforms: ["typescript", "imports"],
    filePath: rel,
  }).code;

  // Rewrite `@/x` to a relative path inside the temp tree, with the `.js`
  // extension the transpiled files actually have.
  const depth = rel.split("/").length - 2; // dirs below `src/`
  const up = "../".repeat(depth);
  const rewritten = code.replace(
    /(["'])@\/([^"']+)\1/g,
    (_m, q, p) => `${q}${up}${p}.js${q}`,
  );

  const dest = join(out, rel.replace(/\.tsx?$/, ".js"));
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, rewritten);
}

await transpile("src/lib/post-auth.ts");
await transpile("src/lib/auth/landing.ts");

const { postAuthDestination } = await import(
  pathToFileURL(join(out, "src/lib/post-auth.js")).href
);
const { signedInLanding } = await import(
  pathToFileURL(join(out, "src/lib/auth/landing.js")).href
);

/** A Supabase client that answers the two queries the routing code makes. */
function fakeSupabase({ role = "buyer", shop = null } = {}) {
  return {
    from(table) {
      const rows = table === "profiles" ? { role } : shop;
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        maybeSingle: async () => ({ data: rows, error: null }),
      };
    },
  };
}

const cases = [
  {
    name: "existing buyer login → storefront (new buyers go to /signup/complete from the bridge)",
    got: await postAuthDestination(fakeSupabase({ role: "buyer" }), "u1"),
    want: "/",
  },
  {
    name: "new seller signup → seller onboarding step 1",
    got: await postAuthDestination(fakeSupabase({ role: "seller" }), "u2"),
    want: "/seller/onboarding?step=1",
  },
  {
    name: "existing buyer login → storefront",
    got: await postAuthDestination(fakeSupabase({ role: "buyer" }), "u3"),
    want: "/",
  },
  {
    name: "existing approved seller login → Seller Hub",
    got: await postAuthDestination(
      fakeSupabase({
        role: "seller",
        shop: {
          id: "s1",
          status: "approved",
          verified: true,
          subscription_status: "active",
          bank_account_number: "123",
        },
      }),
      "u4",
    ),
    want: "/seller",
  },
  {
    // `onboardingStepFor`: a shop with no bank account on file is at step 2
    // (verification), not step 1 — the business profile already exists.
    name: "seller mid-onboarding (no bank details) → verification step 2",
    got: await postAuthDestination(
      fakeSupabase({
        role: "seller",
        shop: {
          id: "s2",
          status: "pending",
          verified: false,
          subscription_status: "none",
          bank_account_number: null,
        },
      }),
      "u5",
    ),
    want: "/seller/onboarding?step=2",
  },
  {
    // A shop row is proof of a seller (src/lib/roles.ts), and sql/0014 keeps
    // `role` and shop ownership in agreement — so this state is unreachable in
    // practice. The assertion pins the documented behaviour: owning a shop
    // wins, and an approved shop goes to the hub.
    name: "account owning an approved shop → Seller Hub (shop ownership wins)",
    got: await postAuthDestination(
      fakeSupabase({ role: "buyer", shop: { id: "s3", status: "approved", verified: true } }),
      "u6",
    ),
    want: "/seller",
  },
  {
    name: "safe ?next= is honoured",
    got: await postAuthDestination(fakeSupabase({ role: "buyer" }), "u7", "/orders"),
    want: "/orders",
  },
  {
    name: "signedInLanding: buyer → storefront",
    got: signedInLanding({ profile: { role: "buyer" }, shop: null }),
    want: "/",
  },
  {
    name: "signedInLanding: approved seller → hub",
    got: signedInLanding({
      profile: { role: "seller" },
      shop: {
        id: "s1",
        status: "approved",
        verified: true,
        subscription_status: "active",
        bank_account_number: "1",
      },
    }),
    want: "/seller",
  },
  {
    name: "signedInLanding: seller with no shop → onboarding",
    got: signedInLanding({ profile: { role: "seller" }, shop: null }),
    want: "/seller/onboarding?step=1",
  },
];

let failed = 0;
for (const c of cases) {
  const ok = c.got === c.want;
  if (!ok) failed++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${c.name}\n        got ${JSON.stringify(c.got)}  want ${JSON.stringify(c.want)}`,
  );
}

await rm(out, { recursive: true, force: true });

console.log(`\n${cases.length - failed}/${cases.length} passed`);
process.exit(failed === 0 ? 0 : 1);
