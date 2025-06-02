/** @type {import('tailwindcss').Config} */
module.exports = {
  important: '.innerbody',
  content: [
    "./layouts/**/*.html",
    "./content/**/*.{html,md}",
    "./themes/**/layouts/**/*.html",
    "./static/js/**/*.{js,jsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [require("daisyui")],
  daisyui: {
    themes: ["light", "dark"]
  },
  safelist: [
 
  ]
} 