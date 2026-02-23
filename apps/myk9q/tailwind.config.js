import animate from "tailwindcss-animate";
import { myk9Preset } from "@myk9/ui";

/** @type {import('tailwindcss').Config} */
export default {
  // Use @myk9/ui preset for shared tokens (colors, spacing, typography, animations)
  presets: [myk9Preset],

  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: ['class', '.theme-dark'],
  theme: {
    extend: {
      // ===== COLORS (myK9Q-specific extensions) =====
      colors: {
        // Primary hover (not in preset)
        primary: {
          hover: 'var(--primary-hover)',
        },

        // Semantic status colors (app-specific)
        success: 'var(--success-green)',
        warning: 'var(--warning-amber)',
        error: 'var(--error-red)',

        // Check-in status colors (myK9Q-specific, not in preset)
        status: {
          'no-status': 'var(--status-no-status)',
          'checked-in': 'var(--status-checked-in)',
          'at-gate': 'var(--status-at-gate)',
          'come-to-gate': 'var(--status-come-to-gate)',
          'in-ring': 'var(--status-in-ring)',
          conflict: 'var(--status-conflict)',
          pulled: 'var(--status-pulled)',
          // Class status (extend preset values)
          'start-time': 'var(--status-start-time)',
          'offline-scoring': 'var(--status-offline-scoring)',
          none: 'var(--status-none)',
          // Result status
          pending: 'var(--status-pending)',
        },

        // Surface muted (myK9Q-specific, not in preset)
        surface: {
          muted: 'var(--surface-muted)',
        },
      },

      // ===== SPACING (myK9Q-specific token names) =====
      // Preset provides space-xs through space-4xl
      // Keep myK9Q token-* aliases for backward compatibility
      spacing: {
        'token-xs': 'var(--token-space-xs)',
        'token-sm': 'var(--token-space-sm)',
        'token-md': 'var(--token-space-md)',
        'token-lg': 'var(--token-space-lg)',
        'token-xl': 'var(--token-space-xl)',
        'token-2xl': 'var(--token-space-2xl)',
        'token-3xl': 'var(--token-space-3xl)',
        'token-4xl': 'var(--token-space-4xl)',
        // Touch targets (myK9Q-specific variable names)
        'touch-min': 'var(--min-touch-target)',
        'touch-comfortable': 'var(--comfortable-touch-target)',
        'touch-stress': 'var(--stress-touch-target)',
      },

      // ===== BORDER RADIUS (myK9Q-specific token names) =====
      borderRadius: {
        'token-sm': 'var(--token-radius-sm)',
        'token-md': 'var(--token-radius-md)',
        'token-lg': 'var(--token-radius-lg)',
        'token-xl': 'var(--token-radius-xl)',
      },

      // ===== TYPOGRAPHY (myK9Q-specific) =====
      // fontFamily comes from preset (Montserrat + Playfair Display)
      fontSize: {
        'token-xs': ['var(--token-font-xs)', { lineHeight: '1.4' }],
        'token-sm': ['var(--token-font-sm)', { lineHeight: '1.4' }],
        'token-md': ['var(--token-font-md)', { lineHeight: '1.5' }],
        'token-lg': ['var(--token-font-lg)', { lineHeight: '1.5' }],
        'token-xl': ['var(--token-font-xl)', { lineHeight: '1.4' }],
        'token-2xl': ['var(--token-font-2xl)', { lineHeight: '1.3' }],
        'token-3xl': ['var(--token-font-3xl)', { lineHeight: '1.2' }],
      },
      fontWeight: {
        'token-normal': 'var(--token-font-weight-normal)',
        'token-medium': 'var(--token-font-weight-medium)',
        'token-semibold': 'var(--token-font-weight-semibold)',
        'token-bold': 'var(--token-font-weight-bold)',
        'token-extrabold': 'var(--token-font-weight-extrabold)',
      },

      // ===== SHADOWS (myK9Q-specific) =====
      boxShadow: {
        'token-sm': 'var(--token-shadow-sm)',
        'token-md': 'var(--token-shadow-md)',
        'token-lg': 'var(--token-shadow-lg)',
        'token-xl': 'var(--token-shadow-xl)',
        'hover': 'var(--token-hover-shadow)',
        'hover-lg': 'var(--token-hover-shadow-lg)',
        'pending-glow': 'var(--pending-glow)',
      },

      // ===== TRANSITIONS (myK9Q-specific) =====
      // apple ease comes from preset; add spring and duration overrides
      transitionTimingFunction: {
        'apple-spring': 'var(--apple-spring)',
      },
      transitionDuration: {
        'fast': '150ms',
        'normal': '300ms',
        'slow': '500ms',
      },

      // ===== Z-INDEX (myK9Q-specific) =====
      zIndex: {
        'base': 'var(--token-z-base)',
        'raised': 'var(--token-z-raised)',
        'dropdown': 'var(--token-z-dropdown)',
        'overlay': 'var(--token-z-overlay)',
        'popover': 'var(--token-z-popover)',
        'modal': 'var(--token-z-modal)',
        'toast': 'var(--token-z-toast)',
        'menu-overlay': 'var(--z-menu-overlay)',
        'menu': 'var(--z-menu)',
      },

      // ===== ANIMATIONS (myK9Q-specific, beyond preset) =====
      keyframes: {
        'slide-in-left': {
          from: { transform: 'translateX(-100%)' },
          to: { transform: 'translateX(0)' },
        },
        'pulse-subtle': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
      },
      animation: {
        'slide-in-top': 'slide-in-from-top 0.3s var(--apple-ease)',
        'slide-in-bottom': 'slide-in-from-bottom 0.3s var(--apple-ease)',
        'slide-in-left': 'slide-in-left 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        'pulse-subtle': 'pulse-subtle 2s ease-in-out infinite',
      },

      // ===== BACKGROUNDS (myK9Q-specific) =====
      backgroundImage: {
        'brand-gradient': 'var(--brand-gradient)',
        'skeleton': 'var(--skeleton-gradient)',
        'skeleton-dark': 'var(--skeleton-gradient-dark)',
      },
    },
  },
  plugins: [
    animate,
  ],
};
