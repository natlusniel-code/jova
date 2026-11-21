import Link from "next/link";
import { Logo, Badge } from "@/components/ui";

const BULLETS = [
  {
    title: "Verified sellers only",
    body: "Every shop sends ID, bank details and a registration number before it can list.",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3 4.5 6v6c0 4.4 3.1 7.7 7.5 9 4.4-1.3 7.5-4.6 7.5-9V6L12 3Z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    ),
  },
  {
    title: "We hold your money until you confirm delivery",
    body: "You transfer to Jova, not to the seller. We release the money after you confirm.",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
        <rect x="3.5" y="6.5" width="17" height="12" rx="2.5" />
        <path d="M3.5 10.5h17" />
        <circle cx="12" cy="14.5" r="1.6" />
      </svg>
    ),
  },
  {
    title: "Chat directly with service providers",
    body: "Describe the job, get a quote, and pay only when you accept the offer.",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.5 12c0 4.1-3.8 7.4-8.5 7.4-1 0-1.9-.15-2.8-.42L4 21l1.3-3.6A7 7 0 0 1 3.5 12C3.5 7.9 7.3 4.6 12 4.6s8.5 3.3 8.5 7.4Z" />
      </svg>
    ),
  },
];

/**
 * The two-column auth shell.
 *
 * ── Left: the brand panel ─────────────────────────────────────────────
 * A deep-green gradient with a soft radial highlight and a faint dot grid
 * — the same treatment as the landing hero, so the login screen is
 * recognisably the same product. It carries the three trust promises,
 * which is the only thing a person needs to read before signing in.
 *
 * ── Right: the action column ──────────────────────────────────────────
 * A warm off-white canvas (not white, not black) with the form centred in
 * a 420px column. On a phone the brand panel collapses to a compact
 * header and the action column takes the whole screen.
 *
 * ── Why the desktop column is exactly one viewport tall ───────────────
 * Every way in — three providers, the email/password form, the code
 * fallback, the link to the other page — has to be visible at once. A
 * login screen that hides its last button below the fold makes people
 * think the page is broken. So on `lg` and up the shell is pinned to
 * `100dvh` and the action column is a fixed-height flex box: the form is
 * centred inside it and never pushes the page taller than the window.
 *
 * The video used to sit above the form, which is what pushed the email
 * fields off a laptop screen. It now lives in the brand panel, where it
 * has room and costs the form nothing. On a phone, where the brand panel
 * is hidden, a short version of the same video still opens the page.
 *
 * `overflow-y-auto` on the action column is a safety valve, not the
 * normal path: at a normal laptop height nothing overflows, but on a very
 * short window (or with a long server error showing) the column scrolls
 * inside itself instead of clipping the submit button.
 */
export function AuthSplit({
  children,
  media,
}: {
  children: React.ReactNode;
  /** Optional brand media (the sign-in video) for the left panel. */
  media?: React.ReactNode;
}) {
  return (
    <div className="grid h-[100dvh] min-h-0 overflow-hidden bg-[var(--canvas)] lg:grid-cols-[1.02fr_1fr]">
      {/* ── Brand panel ─────────────────────────────────────────────── */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-[linear-gradient(150deg,#0a6b3d_0%,#075232_55%,#053f28_100%)] p-9 text-white lg:flex lg:h-[100dvh]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(620px 320px at 6% -8%, rgba(203,242,107,.20), transparent 62%), radial-gradient(480px 280px at 100% 104%, rgba(79,191,125,.24), transparent 60%)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.14]"
          style={{
            backgroundImage: "radial-gradient(rgba(255,255,255,.6) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
            maskImage: "radial-gradient(70% 60% at 50% 40%, #000, transparent)",
            WebkitMaskImage: "radial-gradient(70% 60% at 50% 40%, #000, transparent)",
          }}
        />

        <div className="relative">
          <Logo light />
        </div>

        <div className="relative max-w-[430px]">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[11px] font-bold tracking-wide text-[#dff5e6]">
            <span className="h-1.5 w-1.5 rounded-full bg-lime" />
            Nigeria&apos;s escrow marketplace
          </span>

          <h1 className="mt-4 font-display text-[28px] font-extrabold leading-[1.12] tracking-[-0.04em] text-white">
            Buy and hire from verified sellers in your state.
          </h1>

          {media ? <div className="mt-5">{media}</div> : null}

          <ul className="mt-6 space-y-4">
            {BULLETS.map((b) => (
              <li key={b.title} className="flex gap-3">
                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-[12px] border border-white/15 bg-white/10 text-lime">
                  {b.icon}
                </span>
                <div>
                  <p className="text-[13.5px] font-bold leading-snug text-white">{b.title}</p>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-[#bcd9c8]">{b.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-[11.5px] leading-relaxed text-[#9dc4ae]">
          By continuing you agree to our{" "}
          <Link href="/legal/terms" className="underline decoration-white/30 underline-offset-2 hover:text-white">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/legal/refunds" className="underline decoration-white/30 underline-offset-2 hover:text-white">
            Refund Policy
          </Link>
          .
        </p>
      </aside>

      {/* ── Action column ───────────────────────────────────────────── */}
      <section className="flex h-[100dvh] min-h-0 flex-col overflow-hidden">
        {/* Compact header for a phone, where the brand panel is hidden. */}
        <div className="flex items-center justify-between px-5 py-4 lg:hidden">
          <Logo />
          <Badge tone="green" dot>
            Escrow protected
          </Badge>
        </div>

        {/* No video on a phone: the brand panel is hidden there, and the
            form is the only thing that matters — every way in should be as
            close to the top of the screen as possible. */}

        <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden px-5 py-2 sm:px-8 lg:px-8 lg:py-4">
          <div className="nm-rise w-full max-w-[420px] max-h-full">{children}</div>
        </div>
      </section>
    </div>
  );
}
