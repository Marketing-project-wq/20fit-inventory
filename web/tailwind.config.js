/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eafaf3',
          100: '#c9f2df',
          200: '#94e6c0',
          300: '#5bd6a0',
          400: '#2dbf83',
          500: '#13a36a',
          600: '#0a8356',
          700: '#0a6845',
          800: '#0b5239',
          900: '#0a4430',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Avenir', 'Helvetica', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
