/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx,css}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        'aed-base': 'var(--aed-base)',
        'aed-border': 'var(--aed-border)',
      },
    },
  },
  plugins: [],
};
