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
        // Status colors (for class status, etc.)
        status: {
          pending: '#FF9500',
          approved: '#34C759',
          rejected: '#FF3B30',
          draft: '#8E8E93',
          'checked-in': '#34C759',
          'at-gate': '#FF9500',
          'in-ring': '#007AFF',
          scored: '#5856D6',
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
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Display"',
          '"SF Pro Text"',
          'system-ui',
          'sans-serif',
        ],
      },

      // Shadows
      boxShadow: {
        'card': '0 1px 3px rgba(0, 0, 0, 0.04)',
        'card-hover': '0 12px 32px rgba(0, 0, 0, 0.08)',
        'dialog': '0 24px 48px rgba(0, 0, 0, 0.15)',
        'button': '0 4px 12px rgba(0, 122, 255, 0.3)',
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
