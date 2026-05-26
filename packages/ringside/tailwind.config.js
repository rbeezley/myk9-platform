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
 * **Preflight is disabled** (`corePlugins.preflight = false`). Importing
 * `@myk9/ringside/styles` must NOT globally reset the host app's
 * typography, form controls, borders, or body defaults. CLAUDE.md
 * mandates myK9Q stays on semantic CSS — even consuming a prebuilt
 * stylesheet shouldn't drag Tailwind's opinionated reset across the
 * boundary. The base layer still emits the `--tw-*` CSS variables that
 * several utilities (gradients, transitions, ring) depend on, just not
 * the global element resets.
 *
 * Implication for ringside components: don't rely on Preflight defaults
 * (e.g. `border` won't be `solid` by default — use `border-solid`
 * explicitly when needed; `<h1>` won't be visually distinguished —
 * style it explicitly).
 *
 * @type {import('tailwindcss').Config}
 */
export default {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {},
  },
  plugins: [animate],
};
