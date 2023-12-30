/** @type {import('tailwindcss').Config} */
const colors = require('tailwindcss/colors')
module.exports = {
  content: ["./templates/**/*.html", "./theme/**/*.html"],
  theme: {
    fontFamily: {
      'default': "Arial, Verdana, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, " +
          "\"Helvetica Neue\", Arial, \"Noto Sans\", sans-serif, \"Apple Color Emoji\", \"Segoe UI Emoji\", " +
          "\"Segoe UI Symbol\", \"Noto Color Emoji\""
    },
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      green: "var(--green)",
      black: colors.black,
      white: colors.white,
      gray: "#e8eded"
    }
  },
  variants: {
    extend: {},
  },
  plugins: [],
}

