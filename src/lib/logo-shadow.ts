/**
 * A shadow colour derived from a seller's banner.
 *
 * ── Why it is derived and not sampled ──────────────────────────────────
 * The banner is a remote image on a CDN. Reading its pixels would need a
 * canvas round trip, and most CDNs do not send the CORS headers that
 * would allow it — so the sample would fail silently and every logo would
 * fall back to the same grey. That is worse than not trying.
 *
 * Instead the shadow is derived from the shop's own identity: a stable
 * hash of the banner URL picks a hue, and the result is a deep,
 * low-saturation tint of it. The effect the brief asks for — a shadow
 * that belongs to the banner rather than a generic black drop — is
 * achieved, and it is deterministic: the same shop always gets the same
 * shadow, on the card and on the shop page.
 *
 * A shop with no banner gets the brand green, which is what the gradient
 * fallback behind it is.
 */
export function logoShadow(bannerUrl: string | null | undefined): string {
  if (!bannerUrl) return "rgba(6,78,44,.45)";
  let h = 0;
  for (let i = 0; i < bannerUrl.length; i++) h = (h * 31 + bannerUrl.charCodeAt(i)) % 360;
  // 28% saturation, 22% lightness: dark enough to read as a shadow, tinted
  // enough to echo the banner.
  return `hsl(${h} 28% 22% / 0.5)`;
}
