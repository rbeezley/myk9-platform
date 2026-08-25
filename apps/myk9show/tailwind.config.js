import animate from 'tailwindcss-animate';

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    '../../packages/ui/src/**/*.{js,ts,jsx,tsx}',
    // Shared packages render their own Tailwind utilities inside myK9Show, so
    // their source must be scanned too — otherwise classes used ONLY here (e.g.
    // the scoresheet's bg-red-700 Excused chip) silently never get generated.
    '../../packages/scoring-ui/src/**/*.{js,ts,jsx,tsx}',
    '../../packages/ringside/src/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      colors: {
        /* Heritage style palette — see features/heritage/tokens.ts for the canonical source */
        heritage: {
          paper: '#f8f4ea',
          ink: '#1a1612',
          claret: '#8a1818',
          gold: '#8a6a45',
          quill: '#6b4f3a',
          'paper-dark': '#d9d2c2',
        },
        /* Warm dark surface scale — replaces cool gray-900/800 in dark mode */
        warm: {
          950: '#141413',
          900: '#1e1e1b',
          800: '#252522',
          700: '#2e2e2b',
          600: '#3a3a36',
        },
        // Keep CSS-variable tokens themeable while exposing an alpha channel
        // to Tailwind. A bare `var(--token)` silently drops `bg-token/30`,
        // `border-token/50`, and friends during the production build. The
        // `color-mix()` form lets Tailwind substitute its opacity value for
        // both the plain utility and its opacity variants.
        background: 'color-mix(in srgb, var(--background) calc(<alpha-value> * 100%), transparent)',
        foreground: 'color-mix(in srgb, var(--foreground) calc(<alpha-value> * 100%), transparent)',
        'background-alt':
          'color-mix(in srgb, var(--background-alt) calc(<alpha-value> * 100%), transparent)',
        /* Semantic status colors — single source of truth from design-tokens.css */
        status: {
          'checked-in':
            'color-mix(in srgb, var(--status-checked-in) calc(<alpha-value> * 100%), transparent)',
          conflict:
            'color-mix(in srgb, var(--status-conflict) calc(<alpha-value> * 100%), transparent)',
          pulled:
            'color-mix(in srgb, var(--status-pulled) calc(<alpha-value> * 100%), transparent)',
          'at-gate':
            'color-mix(in srgb, var(--status-at-gate) calc(<alpha-value> * 100%), transparent)',
          'come-to-gate':
            'color-mix(in srgb, var(--status-come-to-gate) calc(<alpha-value> * 100%), transparent)',
          'in-ring':
            'color-mix(in srgb, var(--status-in-ring) calc(<alpha-value> * 100%), transparent)',
          completed:
            'color-mix(in srgb, var(--status-completed) calc(<alpha-value> * 100%), transparent)',
          'no-status':
            'color-mix(in srgb, var(--status-no-status) calc(<alpha-value> * 100%), transparent)',
        },
        card: {
          DEFAULT: 'color-mix(in srgb, var(--card) calc(<alpha-value> * 100%), transparent)',
          secondary:
            'color-mix(in srgb, var(--card-secondary) calc(<alpha-value> * 100%), transparent)',
          foreground:
            'color-mix(in srgb, var(--card-foreground) calc(<alpha-value> * 100%), transparent)',
        },
        popover: {
          DEFAULT: 'color-mix(in srgb, var(--popover) calc(<alpha-value> * 100%), transparent)',
          foreground:
            'color-mix(in srgb, var(--popover-foreground) calc(<alpha-value> * 100%), transparent)',
        },
        primary: {
          DEFAULT: 'color-mix(in srgb, var(--primary) calc(<alpha-value> * 100%), transparent)',
          foreground:
            'color-mix(in srgb, var(--primary-foreground) calc(<alpha-value> * 100%), transparent)',
        },
        secondary: {
          DEFAULT: 'color-mix(in srgb, var(--secondary) calc(<alpha-value> * 100%), transparent)',
          foreground:
            'color-mix(in srgb, var(--secondary-foreground) calc(<alpha-value> * 100%), transparent)',
        },
        muted: {
          DEFAULT: 'color-mix(in srgb, var(--muted) calc(<alpha-value> * 100%), transparent)',
          foreground:
            'color-mix(in srgb, var(--muted-foreground) calc(<alpha-value> * 100%), transparent)',
        },
        accent: {
          DEFAULT: 'color-mix(in srgb, var(--accent) calc(<alpha-value> * 100%), transparent)',
          foreground:
            'color-mix(in srgb, var(--accent-foreground) calc(<alpha-value> * 100%), transparent)',
        },
        destructive: {
          DEFAULT: 'rgb(var(--destructive) / <alpha-value>)',
          foreground: 'rgb(var(--destructive-foreground) / <alpha-value>)',
          // Theme-aware red tuned for AA contrast as SMALL text on
          // popover/card surfaces (see --destructive-strong in index.css).
          strong: 'rgb(var(--destructive-strong) / <alpha-value>)',
        },
        success: {
          DEFAULT: 'rgb(var(--success) / <alpha-value>)',
          foreground: 'rgb(var(--success-foreground) / <alpha-value>)',
        },
        warning: {
          DEFAULT: 'rgb(var(--warning) / <alpha-value>)',
          foreground: 'rgb(var(--warning-foreground) / <alpha-value>)',
        },
        info: {
          DEFAULT: 'rgb(var(--info) / <alpha-value>)',
          foreground: 'rgb(var(--info-foreground) / <alpha-value>)',
          strong: 'rgb(var(--info-strong) / <alpha-value>)',
        },
        border: 'color-mix(in srgb, var(--border) calc(<alpha-value> * 100%), transparent)',
        input: 'color-mix(in srgb, var(--input) calc(<alpha-value> * 100%), transparent)',
        ring: 'color-mix(in srgb, var(--ring) calc(<alpha-value> * 100%), transparent)',
        chart: {
          1: 'color-mix(in srgb, var(--chart-1) calc(<alpha-value> * 100%), transparent)',
          2: 'color-mix(in srgb, var(--chart-2) calc(<alpha-value> * 100%), transparent)',
          3: 'color-mix(in srgb, var(--chart-3) calc(<alpha-value> * 100%), transparent)',
          4: 'color-mix(in srgb, var(--chart-4) calc(<alpha-value> * 100%), transparent)',
          5: 'color-mix(in srgb, var(--chart-5) calc(<alpha-value> * 100%), transparent)',
        },
      },
      keyframes: {
        'accordion-down': {
          from: {
            height: '0',
          },
          to: {
            height: 'var(--radix-accordion-content-height)',
          },
        },
        'accordion-up': {
          from: {
            height: 'var(--radix-accordion-content-height)',
          },
          to: {
            height: '0',
          },
        },
        'slide-up': {
          '0%': { transform: 'translateY(40px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        'confetti-fall': {
          '0%': { transform: 'translateY(0) rotate(0deg)', opacity: '1' },
          '100%': { transform: 'translateY(400px) rotate(720deg)', opacity: '0' },
        },
        'pulse-border': {
          '0%, 100%': { borderColor: 'rgb(63 63 70)' },
          '50%': { borderColor: 'rgb(59 130 246)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'slide-up': 'slide-up 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        shimmer: 'shimmer 3s ease-in-out infinite',
        'confetti-fall': 'confetti-fall 2s ease-out forwards',
        'pulse-border': 'pulse-border 1s ease-in-out',
      },
      fontFamily: {
        sans: [
          'Montserrat',
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Display"',
          'system-ui',
          'sans-serif',
        ],
        serif: ['Fraunces', 'Georgia', '"Times New Roman"', 'serif'],
        display: ['Fraunces', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', '"SF Mono"', 'Consolas', 'monospace'],
      },
      // INTENT: the whole type scale, as one token. docs/INTENT.md requires a
      // 16px body minimum and never below 14px for anything; before this the
      // app rendered ~99% of its text at 14px because `text-sm` (Tailwind's
      // 14px) had become the default body size, leaving a 16÷14 = 1.14 step
      // ratio and effectively no hierarchy (MYK9-220).
      //
      // TEXT RANGE (xs..xl) is the decision: 14 / 16 / 20 / 25 / 31, geometric
      // at 1.25 anchored on a 16px body, with 14px kept below it as the caption
      // step and the absolute floor. Tailwind's default text-xs is 12px, which
      // is too small for show-day tablet use and retired exhibitors.
      //
      // DISPLAY RANGE (2xl..6xl) is deliberately CAPPED rather than continuing
      // the 1.25 ratio. Continuing it would reach 39 / 49 / 61 / 76 / 95, and
      // the largest tokens are not decorative here — they are the running clock
      // on the live scoresheets, inside cards that are `overflow-hidden`. At
      // 76px a `font-mono` M:SS.HH time overruns its card at phone width and a
      // judge silently loses a digit off a scored run. These values keep the
      // ladder monotonic and hierarchical while leaving the timers room at
      // 375px.
      //
      // Every step is declared here on purpose: the scale must stay monotonic,
      // so raising `sm` to 16px forces `base` and everything above it up too.
      // Keeping it as one token block is the rollback story — reverting this
      // object restores the previous typography app-wide in a single diff.
      // Do NOT compensate for the new scale in individual components; if a
      // surface breaks, that is evidence about the scale, not a component bug.
      // Print/export templates may still use smaller inline sizes when fitting
      // official fixed-format forms.
      //
      // 7xl–9xl are intentionally left at Tailwind's defaults (72 / 96 / 128px);
      // 6xl stays below 72px so the ladder does not invert at that boundary.
      fontSize: {
        xs: ['0.875rem', { lineHeight: '1.25rem' }], // 14px — caption / floor
        sm: ['1rem', { lineHeight: '1.5rem' }], // 16px — body
        base: ['1.25rem', { lineHeight: '1.75rem' }], // 20px
        lg: ['1.5625rem', { lineHeight: '2rem' }], // 25px
        xl: ['1.9375rem', { lineHeight: '2.375rem' }], // 31px
        '2xl': ['2.25rem', { lineHeight: '2.75rem' }], // 36px
        '3xl': ['2.625rem', { lineHeight: '3rem' }], // 42px
        '4xl': ['3rem', { lineHeight: '1.1' }], // 48px
        '5xl': ['3.5rem', { lineHeight: '1.1' }], // 56px
        '6xl': ['4.125rem', { lineHeight: '1.1' }], // 66px
      },
      transitionTimingFunction: {
        apple: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        bounce: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        // Motion-language easings — see docs/plan-motion-consistency.md.
        // Utilities: `ease-enter` (anything appearing), `ease-exit` (anything leaving).
        enter: 'cubic-bezier(0.16, 1, 0.3, 1)',
        exit: 'ease-in',
      },
      // Motion-language duration tokens — the single source of truth for animation
      // timing. Never hardcode a new duration; reference `duration-{micro|state|enter|layout}`.
      // See docs/plan-motion-consistency.md for the category rules.
      transitionDuration: {
        micro: '150ms', // hover, focus, pressed states
        state: '200ms', // in-place status/color/toggle crossfade
        enter: '250ms', // dialogs, sheets, toasts entering
        layout: '350ms', // row reorder, expand/collapse, list layout shift
      },
    },
  },
  plugins: [animate],
};
