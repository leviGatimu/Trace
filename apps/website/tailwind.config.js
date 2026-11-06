/** @type {import("tailwindcss").Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",

        /*
          Trace's accent is #6e9bff — a periwinkle that sits well on the app's
          near-black canvas but is too pale for text on a light page. The scale
          keeps it as 400 (used in dark mode) and darkens through 600/700 for
          the light theme, so one hue serves both.
        */
        accent: {
          50: "#eef3ff",
          100: "#dee8ff",
          200: "#c3d5ff",
          300: "#9dbaff",
          400: "#6e9bff",
          500: "#4b7bf5",
          600: "#345ce2",
          700: "#2a48bd",
          800: "#273e97",
          900: "#253977",
        },

        /* The app's own surfaces, reused for dark panels on the site. */
        ink: {
          950: "#08090b",
          900: "#0b0c0f",
          800: "#0e1013",
          700: "#14161a",
        },

        /*
          The eight hues Trace hashes application names onto. They are what the
          day ribbon is made of, so the site draws its ribbons from the same
          list rather than inventing a second palette.
        */
        app: {
          1: "#6e9bff",
          2: "#e0a458",
          3: "#5fb3a1",
          4: "#c77dbb",
          5: "#e0736b",
          6: "#8c8fe0",
          7: "#7fb069",
          8: "#d99ac0",
        },
      },
      fontFamily: {
        sans: ["Clash Grotesk", "system-ui", "sans-serif"],
        heading: ["Clash Display", "Clash Grotesk", "sans-serif"],
        display: ["Clash Display", "Clash Grotesk", "sans-serif"],
        mono: ["JetBrains Mono", "Cascadia Mono", "Consolas", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
