/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#040b16',
        card: 'rgba(11, 25, 44, 0.6)',
        border: 'rgba(56, 189, 248, 0.3)',
        neonBlue: '#38bdf8',
        neonPurple: '#a855f7',
      }
    },
  },
  plugins: [],
}
