import type { Config } from "tailwindcss";

/**
 * Tailwind theme for Jova.
 *
 * The palette mirrors the CSS custom properties in `globals.css` so a
 * utility class and a `var(…​)` reference always resolve to the same
 * colour. The brand ramp is the deep green of the design system; `ink` is
 * the TEXT ramp (never a background), and `canvas` is the warm off-white
 * the whole app sits on.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f1f9f4",
          100: "#e7f4ec",
          200: "#c6e6d4",
          300: "#93d2b0",
          400: "#4fbf7d",
          500: "#0b7a45",
          600: "#0a6e3e",
          700: "#08603a",
          800: "#064e2c",
          900: "#053f23",
        },
        ink: {
          900: "#0b1014",
          800: "#1d252d",
          700: "#39434e",
          600: "#525d69",
          500: "#6c7783",
          400: "#98a2ad",
          300: "#b9c0c8",
        },
        canvas: "#f6f5f1",
        surface: "#ffffff",
        lime: "#cbf26b",
        coral: "#ff6a45",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(11,16,20,.04), 0 2px 8px rgba(11,16,20,.04)",
        lift: "0 2px 4px rgba(11,16,20,.04), 0 12px 28px -8px rgba(11,16,20,.10)",
        deep: "0 4px 8px rgba(11,16,20,.05), 0 28px 60px -18px rgba(11,16,20,.18)",
      },
      borderRadius: {
        xl2: "1.25rem",
        xl3: "1.75rem",
      },
      maxWidth: {
        wrap: "1240px",
      },
    },
  },
  plugins: [],
};

export default config;
