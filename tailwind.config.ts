import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef6ff",
          100: "#d9ebff",
          500: "#1d6fe0",
          600: "#155cc0",
          700: "#12489a",
        },
      },
    },
  },
  plugins: [],
};

export default config;
