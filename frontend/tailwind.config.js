/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bcs: {
          primary:   '#8B1A1A',   // deep red (Bengali cultural red)
          secondary: '#C4860A',   // saffron/gold
          accent:    '#F5E6C8',   // warm cream
          dark:      '#5C1111',   // darker red
          light:     '#FDF6ED',   // very light cream background
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
