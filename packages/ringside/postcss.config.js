/**
 * PostCSS pipeline for @myk9/ringside CSS build.
 *
 * - postcss-import: inlines `@import` statements so the output is a
 *   single self-contained stylesheet consumers can import directly.
 * - tailwindcss: processes `@tailwind` directives against
 *   tailwind.config.js (content paths scan this package's src/).
 * - autoprefixer: vendor prefixing for the same browser targets the
 *   monorepo's other packages use.
 *
 * Output goes to dist/styles/index.css via the package.json `build:css`
 * script.
 */
export default {
  plugins: {
    'postcss-import': {},
    tailwindcss: {},
    autoprefixer: {},
  },
};
