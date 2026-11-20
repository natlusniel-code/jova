import type { Appearance } from "@clerk/types";

/**
 * Clerk's own UI, dressed as Jova.
 *
 * ── Why this exists at all ──────────────────────────────────────────────────
 * The auth screens are custom (`ClerkAuthPanel`), so Clerk's components are
 * barely visible — but they are not invisible. During an OAuth handshake Clerk
 * renders its own "continue" card, and any error it raises can surface in its
 * own dialog. Left unstyled, those moments drop a stock Clerk card into the
 * middle of a warm, green, rounded product and the seam shows.
 *
 * ── What is matched ─────────────────────────────────────────────────────────
 * The values are the ones the rest of the app already uses:
 *   • brand green `#0B7A45` — the same `--brand-500` the buttons use;
 *   • the warm off-white canvas, not white and not black;
 *   • the 15–16px radii the cards and inputs use;
 *   • Plus Jakarta Sans for headings, Inter for body — the two families the
 *     root layout already loads.
 *
 * ── Why `variables` and not raw CSS ─────────────────────────────────────────
 * Clerk's `variables` are its supported theming surface. Overriding its
 * internal class names would break on any Clerk release; the variables are
 * stable, so this keeps working across upgrades.
 */
export const clerkAppearance: Appearance = {
  variables: {
    colorPrimary: "#0B7A45",
    colorText: "#0f172a",
    colorTextSecondary: "#64748b",
    colorBackground: "#ffffff",
    colorInputBackground: "#ffffff",
    colorInputText: "#0f172a",
    colorDanger: "#b42318",
    colorSuccess: "#0B7A45",
    colorWarning: "#b45309",
    borderRadius: "15px",
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
    fontFamilyButtons: "Inter, ui-sans-serif, system-ui, sans-serif",
    fontSize: "14.5px",
    spacingUnit: "1rem",
  },
  elements: {
    // The handshake card: same radius, border and shadow as `nm-card`.
    card: {
      borderRadius: "20px",
      border: "1px solid #e7e5df",
      boxShadow: "0 18px 40px -24px rgba(15, 23, 42, 0.28)",
      background: "#ffffff",
    },
    headerTitle: {
      fontFamily: "'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif",
      fontWeight: "800",
      letterSpacing: "-0.035em",
      color: "#0f172a",
    },
    headerSubtitle: {
      color: "#64748b",
      fontSize: "13.5px",
      lineHeight: "1.6",
    },
    // Buttons inherit the app's primary treatment.
    formButtonPrimary: {
      background: "#0B7A45",
      borderRadius: "15px",
      fontWeight: "700",
      fontSize: "15px",
      textTransform: "none",
      boxShadow: "none",
    },
    formFieldInput: {
      borderRadius: "13px",
      borderColor: "#e7e5df",
      fontSize: "14.5px",
    },
    footerActionLink: {
      color: "#0B7A45",
      fontWeight: "700",
    },
    // Clerk's own footer ("Secured by Clerk") is noise on a branded screen.
    footer: { display: "none" },
    logoBox: { display: "none" },
    logoImage: { display: "none" },
  },
};
