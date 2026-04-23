import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "sentry-neon": "#00FF41",   // The Cyberpunk Matrix Green
        "sentry-border": "#2A2A2A", // The dark industrial border
      },
    },
  },
  plugins: [],
};
export default config;