import type { Config } from "tailwindcss";

// Paleta e identidad tomadas tal cual de happy_pub_inventario.html (:root vars).
// No inventar tonos nuevos — si falta un color, revisar el HTML original primero.
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: "#0F1530",
        surface: "#1B2350",
        "surface-2": "#232D63",
        border: "#33407F",
        text: "#F5F3EA",
        "text-dim": "#AEB4D2",
        "text-faint": "#6E76A5",
        gold: "#C68D17",
        "gold-dim": "#8A6512",
        navy: "#30418A",
        green: "#6FA66A",
        amber: "#D9A73C",
        orange: "#D9793A",
        red: "#D9534F",
      },
      fontFamily: {
        display: ["'Cheddar Gothic Serif'", "Bevan", "serif"],
        accent: ["var(--font-accent)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
