import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        textHighlight: "var(--text-highlight)",
        textPrimary: "var(--text-primary)",
        footerBg: "var(--footer-bg)",
        textBeige: "var(--text-beige)",
        textBody: "var(--text-body)",
        borderSubtitle: "var(--border-subtitle)",
        unfocusedBorder: "var(--unfocused-border)",
        green: "#349934",
        blue: "#0000ff",
        red: "#ff0000",
        yellow: "#ffff00",
        white: "#ffffff",
        black: "#000000",
        gray: "#808080",
        gradient_start: "#007FDC",
        gradient_end: "#27CBC2",
      },
    },
  },
  plugins: [
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('@tailwindcss/typography'),
    // ...
  ],
};
export default config;
