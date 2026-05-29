import type { Config } from 'tailwindcss';

/**
 * myK9 Platform Tailwind Preset
 *
 * Provides consistent design tokens across all myK9 apps.
 * Usage: Add to your tailwind.config.ts presets array.
 */
export const myk9Preset: Partial<Config> = {
  darkMode: 'class',
  theme: {
    extend: {
      // Colors - CSS variable based for theme switching
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        'background-alt': 'var(--background-alt)',
        card: {
          DEFAULT: 'var(--card)',
          secondary: 'var(--card-secondary)',
          foreground: 'var(--card-foreground)',
        },
        popover: {
          DEFAULT: 'var(--popover)',
          foreground: 'var(--popover-foreground)',
        },
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
          blue: '#007AFF',
          purple: '#5856D6',
        },
        secondary: {
          DEFAULT: 'var(--secondary)',
          foreground: 'var(--secondary-foreground)',
        },
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          foreground: 'var(--accent-foreground)',
        },
        destructive: {
          DEFAULT: 'var(--destructive)',
          foreground: 'var(--destructive-foreground)',
        },
        // Semantic status tokens — consumed by <Button variant="success|warning">
        // and direct utility classes. CSS vars must be space-separated RGB components
        // (e.g. --success-green: 52 199 89) so Tailwind can compose alpha variants.
        'success-green': 'rgb(var(--success-green) / <alpha-value>)',
        'warning-orange': 'rgb(var(--warning-orange) / <alpha-value>)',
        'error-red': 'rgb(var(--error-red) / <alpha-value>)',
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',
        // Semantic colors
        success: {
          DEFAULT: '#34C759',
          light: '#30D158',
        },
        warning: {
          DEFAULT: '#FF9500',
          light: '#FF6200',
        },
        error: {
          DEFAULT: '#FF3B30',
          light: '#FF375F',
        },
        // Surface colors
        surface: {
          DEFAULT: 'var(--surface)',
          subtle: 'var(--surface-subtle)',
          elevated: 'var(--surface-elevated)',
        },
        // Brand colors
        brand: {
          blue: 'var(--brand-blue)',
          purple: 'var(--brand-purple)',
        },
        // Status colors (for class status, etc.)
        status: {
          pending: '#FF9500',
          approved: '#34C759',
          rejected: '#FF3B30',
          draft: '#8E8E93',
          // Ringside check-in / ring statuses — canonical design tokens
          // (`--status-*` in design-tokens.css; previously hardcoded an
          // iOS-ish palette that diverged from the real values). Single
          // source of truth so @myk9/ringside, myK9Show, and myK9Q all match.
          'no-status': 'var(--status-no-status)',
          'checked-in': 'var(--status-checked-in)',
          'at-gate': 'var(--status-at-gate)',
          'come-to-gate': 'var(--status-come-to-gate)',
          'in-ring': 'var(--status-in-ring)',
          conflict: 'var(--status-conflict)',
          pulled: 'var(--status-pulled)',
          scored: 'var(--status-completed)',
          // Class workflow statuses
          setup: 'var(--status-setup)',
          briefing: 'var(--status-briefing)',
          break: 'var(--status-break)',
          'in-progress': 'var(--status-in-progress)',
          completed: 'var(--status-completed)',
          // Result statuses
          qualified: 'var(--status-qualified)',
          'not-qualified': 'var(--status-not-qualified)',
          excused: 'var(--status-excused)',
        },
        // Chart colors
        chart: {
          1: 'var(--chart-1)',
          2: 'var(--chart-2)',
          3: 'var(--chart-3)',
          4: 'var(--chart-4)',
          5: 'var(--chart-5)',
        },
      },

      // Spacing scale (mapped from CSS variables)
      spacing: {
        'space-xs': 'var(--space-xs)',
        'space-sm': 'var(--space-sm)',
        'space-md': 'var(--space-md)',
        'space-lg': 'var(--space-lg)',
        'space-xl': 'var(--space-xl)',
        'space-2xl': 'var(--space-2xl)',
        'space-3xl': 'var(--space-3xl)',
        'space-4xl': 'var(--space-4xl)',
      },

      // Font size scale
      fontSize: {
        'token-xs': '0.625rem',
        'token-sm': '0.75rem',
        'token-md': '0.875rem',
        'token-lg': '1rem',
        'token-xl': '1.125rem',
        'token-2xl': '1.25rem',
        'token-3xl': '1.5rem',
      },

      // Border radius
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        xl: '1.25rem',
      },

      // Typography
      fontFamily: {
        sans: [
          'Montserrat',
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Display"',
          '"SF Pro Text"',
          'system-ui',
          'sans-serif',
        ],
        display: ['"Playfair Display"', 'Georgia', 'serif'],
      },

      // Shadows
      boxShadow: {
        card: 'var(--shadow-card, 0 1px 2px rgba(0, 0, 0, 0.05), 0 2px 8px rgba(0, 0, 0, 0.03))',
        'card-hover':
          'var(--shadow-card-hover, 0 2px 4px rgba(0, 0, 0, 0.06), 0 8px 24px rgba(0, 0, 0, 0.06))',
        dialog: '0 24px 48px rgba(0, 0, 0, 0.15)',
        button: '0 4px 12px rgba(0, 122, 255, 0.3)',
      },

      // Animations
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--accordion-content-height)' },
          to: { height: '0' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'fade-out': {
          from: { opacity: '1' },
          to: { opacity: '0' },
        },
        'slide-in-from-top': {
          from: { transform: 'translateY(-100%)' },
          to: { transform: 'translateY(0)' },
        },
        'slide-in-from-bottom': {
          from: { transform: 'translateY(100%)' },
          to: { transform: 'translateY(0)' },
        },
        'sheet-slide-in': {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'translateX(0)' },
        },
        'sheet-slide-out': {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(100%)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'fade-in': 'fade-in 0.2s ease-out',
        'fade-out': 'fade-out 0.2s ease-out',
        'slide-in-from-top': 'slide-in-from-top 0.3s ease-out',
        'slide-in-from-bottom': 'slide-in-from-bottom 0.3s ease-out',
        'sheet-slide-in': 'sheet-slide-in 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        'sheet-slide-out': 'sheet-slide-out 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        shimmer: 'shimmer 1.5s infinite',
      },

      // Transition timing
      transitionTimingFunction: {
        apple: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        spring: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
      },
    },
  },
};

export default myk9Preset;
