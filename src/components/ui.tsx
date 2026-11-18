import Link from "next/link";
import { cn } from "@/lib/utils";

/* =====================================================================
   Shared UI primitives
   ---------------------------------------------------------------------
   Every surface in the app — storefront, seller hub, admin console —
   builds from these. They carry the design system's type, radii, spacing
   and colour so a page never has to invent its own.

   Rule of thumb for this file: no black. The darkest fill is the deep
   green (`--brand-deep`); `--ink` is for text only.
   ===================================================================== */

/* ------------------------------------------------------------------ Logo */
/**
 * The Jova lockup — the cart-and-star mark with the wordmark beside it.
 *
 * ── Why an image and not type ─────────────────────────────────────────
 * The wordmark is drawn artwork, not a font: the letterforms, the tapering
 * underline and the star inside the cart are one piece of design. Rebuilding
 * it from a webfont would drift from the brand the moment the font failed to
 * load, so the lockup ships as two PNGs — the green original for light
 * surfaces and a white cut for the dark auth panel and footer.
 *
 * `compact` drops the wordmark and shows the mark alone, for the places that
 * only have room for a square (the mobile header, the tab bar).
 */
export function Logo({
  compact = false,
  light = false,
  className,
}: {
  compact?: boolean;
  light?: boolean;
  className?: string;
}) {
  const src = compact
    ? "/jova-mark.png"
    : light
      ? "/jova-logo-white.png"
      : "/jova-logo.png";

  return (
    <Link
      href="/"
      aria-label="Jova Marketplace home"
      className={cn("inline-flex items-center", className)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="Jova Marketplace"
        className={cn(
          "w-auto select-none",
          compact ? "h-9" : "h-[26px] sm:h-[28px]",
        )}
        draggable={false}
      />
    </Link>
  );
}

/* ------------------------------------------------------------------ Badge */
const TONES = {
  green: "bg-brand-100 text-brand-800",
  amber: "bg-[#fdf3e1] text-[#8a5a0b]",
  blue: "bg-[#eaf2fd] text-[#1d4f91]",
  violet: "bg-[#efedfe] text-[#4b3bc4]",
  gray: "bg-[#f1efe9] text-[#5a6470]",
  red: "bg-[#ffede7] text-[#b23a1b]",
} as const;

export function Badge({
  children,
  tone = "gray",
  className,
  dot = false,
}: {
  children: React.ReactNode;
  tone?: keyof typeof TONES;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span className={cn("nm-badge", TONES[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function VerifiedBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-bold text-brand-800",
        className,
      )}
    >
      <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor" aria-hidden="true">
        <path d="M12 2 15.1 4.6l4.1.2.2 4.1L22 12l-2.6 3.1-.2 4.1-4.1.2L12 22l-3.1-2.6-4.1-.2-.2-4.1L2 12l2.6-3.1.2-4.1 4.1-.2L12 2Z" opacity=".18" />
        <path d="m10.6 14.6-2.2-2.2 1.1-1.1 1.1 1.1 3.9-3.9 1.1 1.1-5 5Z" />
      </svg>
      Verified
    </span>
  );
}

/**
 * The Premium seller badge, shown on the buyer storefront.
 *
 * ── Why it is a separate badge from Verified ──────────────────────────
 * They mean different things and a shop can have one without the other.
 * "Verified" is about identity — the seller sent ID and bank details and
 * an admin checked them. "Premium" is about the subscription they pay
 * for. Collapsing them would tell a buyer that a paying seller is
 * identity-checked when they may not be, which is the one claim this
 * badge must not make.
 *
 * The amber tone is deliberate: it is the only non-green badge in the
 * trust row, so it reads as a distinct tier at a glance rather than
 * blending into the Verified chip beside it.
 */
export function PremiumBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-[#f2d9a8] bg-[#fdf3e1] px-2 py-0.5 text-[11px] font-bold text-[#8a5a0b]",
        className,
      )}
      title="Premium seller"
    >
      <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor" aria-hidden="true">
        <path d="M12 2.6l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 8.8l5.9-.9L12 2.6Z" />
      </svg>
      Premium
    </span>
  );
}

export function OrderStatusChip({ status }: { status: string }) {
  const map: Record<string, { label: string; tone: keyof typeof TONES }> = {
    pending_payment: { label: "Pending payment", tone: "amber" },
    paid: { label: "Payment confirmed", tone: "blue" },
    accepted: { label: "Accepted", tone: "blue" },
    processing: { label: "Processing", tone: "blue" },
    shipped: { label: "Shipped", tone: "violet" },
    ready_for_pickup: { label: "Ready", tone: "violet" },
    delivered: { label: "Delivered", tone: "green" },
    completed: { label: "Completed", tone: "green" },
    cancelled: { label: "Cancelled", tone: "gray" },
    disputed: { label: "Disputed", tone: "red" },
  };
  const s = map[status] ?? { label: status, tone: "gray" as const };
  return (
    <Badge tone={s.tone} dot>
      {s.label}
    </Badge>
  );
}

export function Star({ value, count, className }: { value: number; count?: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <svg viewBox="0 0 24 24" className="h-3 w-3 fill-[#f2a93b]" aria-hidden="true">
        <path d="m12 17.3-6.2 3.7 1.7-7L2 9.2l7.1-.6L12 2l2.9 6.6 7.1.6-5.5 4.8 1.7 7L12 17.3Z" />
      </svg>
      <span className="text-[11.5px] font-bold text-ink-700">{value ? value.toFixed(1) : "New"}</span>
      {typeof count === "number" && count > 0 && (
        <span className="text-[11px] font-medium text-ink-400">({count})</span>
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ Avatar */

/**
 * The placeholder face for a user who has not uploaded a picture.
 *
 * ── Why an icon and not initials ──────────────────────────────────────
 * The old fallback printed the first letters of the person's name ("DA" for
 * "David Adeyemi") on a green disc. Two problems with that: it reads as a
 * designed avatar rather than a missing one, so nobody realises they can add
 * a photo; and it leaks the person's name into every screenshot, chat list and
 * review row. A neutral outline person says "no picture yet" at a glance.
 *
 * It is drawn with `stroke` and no `fill`, so it is a line icon rather than a
 * solid silhouette — the same visual weight as the bell and tab-bar icons
 * around it.
 */
export function PersonIcon({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <circle cx="12" cy="8.2" r="3.7" />
      <path d="M4.5 20.5c.7-3.6 3.8-5.8 7.5-5.8s6.8 2.2 7.5 5.8" />
    </svg>
  );
}

export function Avatar({
  name,
  src,
  size = 36,
  className,
}: {
  name?: string | null;
  src?: string | null;
  size?: number;
  className?: string;
}) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name ?? "Avatar"}
        width={size}
        height={size}
        className={cn("rounded-full object-cover ring-1 ring-black/5", className)}
        style={{ width: size, height: size }}
      />
    );
  }
  // No picture: a neutral outline person, never the person's initials.
  return (
    <span
      role="img"
      aria-label={name ? `${name} — no profile photo` : "No profile photo"}
      className={cn(
        "grid place-items-center rounded-full bg-[#eef1ee] text-ink-400 ring-1 ring-inset ring-black/5",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <PersonIcon size={Math.round(size * 0.58)} />
    </span>
  );
}

/* ------------------------------------------------------------------ Card */
export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("nm-card", className)}>{children}</div>;
}

export function SectionHead({
  title,
  action,
  href,
  sub,
}: {
  title: string;
  action?: string;
  href?: string;
  sub?: string;
}) {
  return (
    <div className="nm-sec-head">
      <div className="min-w-0">
        <h2 className="truncate">{title}</h2>
        {sub && <p>{sub}</p>}
      </div>
      {action && href && (
        <Link href={href} className="nm-sec-link">
          {action}
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h13M13 6l6 6-6 6" />
          </svg>
        </Link>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Empty */
export function EmptyState({
  icon = "📦",
  title,
  body,
  action,
  href,
}: {
  icon?: string;
  title: string;
  body?: string;
  action?: string;
  href?: string;
}) {
  return (
    <div className="nm-empty">
      <div className="nm-empty-ic">{icon}</div>
      <h3 className="text-[19px]">{title}</h3>
      {body && <p className="mt-2 max-w-[340px] text-[13.5px] leading-relaxed text-ink-500">{body}</p>}
      {action && href && (
        <Link href={href} className="nm-btn-soft mt-5">
          {action}
        </Link>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Alert */
export function Alert({
  tone = "green",
  title,
  children,
}: {
  tone?: "green" | "amber" | "red" | "blue";
  title?: string;
  children: React.ReactNode;
}) {
  const map = {
    green: "bg-brand-50 text-brand-900 border-brand-200",
    amber: "bg-[#fdf7ec] text-[#7a4f08] border-[#f2d9a8]",
    red: "bg-[#fff4f0] text-[#8f2f14] border-[#f7c9b8]",
    blue: "bg-[#f2f7fd] text-[#1d4f91] border-[#cfe0f5]",
  };
  return (
    <div className={cn("rounded-[14px] border px-4 py-3 text-[13px]", map[tone])}>
      {title && <p className="font-bold">{title}</p>}
      <div className={cn(title && "mt-1", "leading-relaxed opacity-90")}>{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ Spinner */
export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn("h-4 w-4 animate-spin", className)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity=".25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/* ------------------------------------------------------------------ Stat */
export function Stat({
  label,
  value,
  hint,
  tone = "plain",
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "plain" | "brand" | "amber" | "red";
  icon?: React.ReactNode;
}) {
  const bg = {
    plain: "bg-white",
    brand: "bg-brand-50",
    amber: "bg-[#fdf7ec]",
    red: "bg-[#fff4f0]",
  }[tone];
  return (
    <div className={cn("nm-card-flat p-4 sm:p-5", bg)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11.5px] font-semibold text-ink-500">{label}</p>
        {icon}
      </div>
      <p className="mt-2 font-display text-[25px] font-extrabold tracking-[-0.04em] text-ink-900">{value}</p>
      {hint && <p className="mt-1 text-[11.5px] text-ink-400">{hint}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ Tabs (link based) */
export function Tabs({
  items,
  current,
}: {
  items: { label: string; href: string; count?: number }[];
  current: string;
}) {
  return (
    <div className="nm-scroll -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      {items.map((t) => {
        const active = t.href === current;
        return (
          <Link key={t.href} href={t.href} className={cn("nm-chip", active && "nm-chip-active")}>
            {t.label}
            {typeof t.count === "number" && t.count > 0 && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-px text-[10.5px] font-bold",
                  active ? "bg-brand-500 text-white" : "bg-[#f1efe9] text-ink-500",
                )}
              >
                {t.count}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ Page head */
/**
 * The heading block every inner page opens with: an optional breadcrumb, a
 * display-size title and a supporting line. Kept here so search, services,
 * orders, the seller hub and the admin console all start at the same
 * vertical rhythm instead of each inventing its own padding.
 */
export function PageHead({
  title,
  sub,
  crumb,
  action,
}: {
  title: string;
  sub?: string;
  crumb?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 pb-1 pt-2">
      <div className="min-w-0">
        {crumb && (
          <div className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-ink-400">{crumb}</div>
        )}
        <h1 className="text-[26px] sm:text-[32px]">{title}</h1>
        {sub && <p className="mt-2 max-w-[620px] text-[13.5px] leading-relaxed text-ink-500">{sub}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
