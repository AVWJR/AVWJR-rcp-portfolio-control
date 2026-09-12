import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "./packages/rcp-brand/src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          950: "#06101C",
          900: "#0B1F3A",
          800: "#122A4A",
          700: "#1B3A63",
          600: "#2A5084",
        },
        gold: {
          700: "#8A6F3A",
          600: "#A8884A",
          500: "#C4A46A",
          400: "#D4BC8A",
          100: "#F3E8CF",
        },
        cream: {
          50: "#FDF8F0",
          100: "#F7F3EA",
          200: "#EFE8D8",
          300: "#E2D8C4",
        },
        ink: {
          900: "#1A1F26",
          700: "#3A414B",
          500: "#6B7280",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        ledger: "0 1px 0 0 rgba(11, 31, 58, 0.06)",
      },
    },
  },
  plugins: [],
};

export default config;
