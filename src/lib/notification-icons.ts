/**
 * The icons a notification is drawn with.
 *
 * ── The problem this solves ───────────────────────────────────────────
 * A notification is drawn by the operating system, not by us, and the OS
 * picks the background: a light shade on a phone in light mode, a near-black
 * one in dark mode. A single fixed icon therefore cannot be "clearly seeable"
 * in both — a dark mark disappears into the dark shade, a white mark
 * disappears into the light one.
 *
 * ── The two slots, and why they are different ─────────────────────────
 * `icon` is the LARGE icon: the picture beside the title. It is drawn in
 * full colour on the OS's own background, so it is the full Jova mark on a
 * white rounded plate. The plate is what makes it readable on a dark shade
 * without turning into a white square on a light one — the mark keeps its
 * green, and the plate is a deliberate part of the artwork rather than a
 * transparent tile the OS fills in.
 *
 * `badge` is the SMALL monochrome icon in the status bar. Android throws
 * away its colour and keeps only the alpha channel, so it must be a solid
 * silhouette — a full-colour image here is exactly what renders as a blank
 * white blob. It is supplied in white and in black, and the caller picks
 * the one that contrasts with the current theme.
 *
 * ── Why the theme is read here and not on the server ──────────────────
 * A push sent from the server has no idea what theme the receiving phone is
 * in, and it must not guess: the wrong choice is invisible. So the server
 * sends the plate icon (which works on both) and the client, which CAN read
 * `prefers-color-scheme`, overrides the badge with the contrasting
 * silhouette when it displays the notification itself.
 */

export type NotificationIcons = {
  /** Large, full-colour icon. */
  icon: string;
  /** Small monochrome status-bar icon. */
  badge: string;
};

/** The plate icon — correct on a light and on a dark shade alike. */
export const NOTIFICATION_ICON = "/notification-icon-192.png";

/** High-resolution plate icon, for the large-image slot on Android. */
export const NOTIFICATION_ICON_LARGE = "/notification-icon-512.png";

/**
 * The silhouette that contrasts with the given theme.
 *
 * On a dark shade the status bar is dark, so the mark must be white; on a
 * light shade it must be black. Getting this backwards is the "I can't see
 * the icon" report, so the mapping is explicit rather than a single asset.
 */
export function badgeForTheme(dark: boolean): string {
  return dark ? "/notification-icon-white.png" : "/notification-icon-black.png";
}

/**
 * Icons for a notification shown from the browser.
 *
 * Reads the live `prefers-color-scheme` when it is available. In a service
 * worker or an older browser without `matchMedia` it falls back to the white
 * silhouette, which is the safer default: the majority of notification
 * shades in the wild are dark, and a white mark on a light shade is still
 * visible where a black mark on a dark shade is not.
 */
export function notificationIcons(): NotificationIcons {
  let dark = true;
  try {
    if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
      dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
  } catch {
    /* keep the dark default */
  }
  return { icon: NOTIFICATION_ICON, badge: badgeForTheme(dark) };
}
