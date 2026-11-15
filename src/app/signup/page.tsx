import { redirect } from "next/navigation";

export const metadata = { title: "Create your account" };

/**
 * `/signup` — a permanent redirect to `/auth`.
 *
 * ── Why this is a redirect and not a page ───────────────────────────────────
 * The multi-step email signup (role → details → verify code → photo) is gone.
 * With Google as the only provider, signing up and signing in are the same
 * act, so there is one screen for both.
 *
 * The role choice that used to be step 1 now lives on `/auth` as a two-card
 * toggle above the Google button, so a seller still picks "I'm here to sell"
 * before continuing — it just no longer needs its own page.
 *
 * `?role=seller` is preserved for the links that pass it (the seller
 * onboarding "create a seller account" button), so those still land on the
 * right default.
 */
export default function SignupPage({
  searchParams,
}: {
  searchParams?: { role?: string; next?: string };
}) {
  const role = searchParams?.role === "seller" ? "seller" : "";
  const raw = searchParams?.next ?? "";
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "";

  const params = new URLSearchParams();
  if (role) params.set("role", role);
  if (next) params.set("next", next);

  const qs = params.toString();
  redirect(qs ? `/auth?${qs}` : "/auth");
}
