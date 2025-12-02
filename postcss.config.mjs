/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
    // Add autoprefixer to improve cross-browser CSS compatibility
    autoprefixer: {},
  },
};

export default config;
