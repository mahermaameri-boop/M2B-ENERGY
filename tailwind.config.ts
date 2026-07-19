import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
      },
      colors: {
        // Accent marque = bleu des maquettes (blue-600/700 ; texte accent #1e5fbf)
        brand: {
          50: "#eaf1fc",
          100: "#d6e4fa",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1e5fbf",
        },
      },
    },
  },
  plugins: [],
};

export default config;
