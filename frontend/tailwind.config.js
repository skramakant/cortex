/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './public/**/*.html',
    './src/js/**/*.js',
    './public/js/**/*.js',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        twitter: {
          blue:      '#1d9bf0',
          'blue-dark': '#1a8cd8',
          'blue-light': '#e8f5fe',
        },
      },
    },
  },
  plugins: [],
};
