import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "ink-bg": "#0B0E14",
        surface: "#151A24",
        ink: "#E4E7EC",
        muted: "#8B93A3",
        accent: "#4A7CFF",
        status: "#2ECC8F",
        line: "#242B38",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;