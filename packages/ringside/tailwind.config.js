import animate from 'tailwindcss-animate';

/**
 * Tailwind config for @myk9/ringside.
 *
 * Per the plan (docs/plans/phase-0-ringside-package.md §3 Q1), this package
 * builds its own CSS so consumers (apps/myk9q now, apps/myk9show /at-show
 * in Phase 1) don't need a Tailwind toolchain — they import
 * `@myk9/ringside/styles` as a prebuilt stylesheet.
 *
 * Content paths intentionally scoped to this package's own src/ — the
 * shared design tokens / colors / spacing scales should live on
 * `@myk9/ui` and be referenced through CSS variables, not duplicated here.
 *
 * @type {import('tailwindcss').Config}
 */
export default {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {},
  },
  plugins: [animate],
};
