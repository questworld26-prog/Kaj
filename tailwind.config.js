/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/client/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        canvas: "#0E1111",
        pod: "#121718",
        card: "#1C2224",
        borderline: "#2A3235",
        primary: {
          500: "#10B981",
          400: "#34D399",
        },
        tracking: {
          500: "#EAB308",
          400: "#FACC15",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};
