import animate from "tailwindcss-animate";

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: ['class', '.theme-dark'],
  theme: {
    extend: {
      // ===== COLORS =====
      // Mapped from myK9Q design-tokens.css to match myK9Show
      colors: {
        // Core semantic colors (shadcn/ui compatible)
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        card: {
          DEFAULT: 'var(--card)',
          foreground: 'var(--card-foreground)',
        },
        popover: {
          DEFAULT: 'var(--card)',
          foreground: 'var(--card-foreground)',
        },
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
          hover: 'var(--primary-hover)',
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
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
        },
        destructive: {
          DEFAULT: 'var(--error-red)',
          foreground: '#ffffff',
        },
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--primary)',

        // Brand colors
        brand: {
          blue: 'var(--brand-blue)',
          purple: 'var(--brand-purple)',
        },

        // Semantic status colors
        success: 'var(--success-green)',
        warning: 'var(--warning-amber)',
        error: 'var(--error-red)',

        // Check-in status colors
        status: {
          'no-status': 'var(--status-no-status)',
          'checked-in': 'var(--status-checked-in)',
          'at-gate': 'var(--status-at-gate)',
          'come-to-gate': 'var(--status-come-to-gate)',
          'in-ring': 'var(--status-in-ring)',
          conflict: 'var(--status-conflict)',
          pulled: 'var(--status-pulled)',
          // Class status colors
          setup: 'var(--status-setup)',
          briefing: 'var(--status-briefing)',
          break: 'var(--status-break)',
          'start-time': 'var(--status-start-time)',
          'in-progress': 'var(--status-in-progress)',
          'offline-scoring': 'var(--status-offline-scoring)',
          completed: 'var(--status-completed)',
          none: 'var(--status-none)',
          // Result status
          qualified: 'var(--status-qualified)',
          'not-qualified': 'var(--status-not-qualified)',
          excused: 'var(--status-excused)',
          pending: 'var(--status-pending)',
        },

        // Surface colors for theming
        surface: {
          DEFAULT: 'var(--surface)',
          subtle: 'var(--surface-subtle)',
          muted: 'var(--surface-muted)',
          elevated: 'var(--surface-elevated)',
        },
      },

      // ===== SPACING =====
      // Mapped from --token-space-* variables
      spacing: {
        'token-xs': 'var(--token-space-xs)',   // 0.125rem / 2px
        'token-sm': 'var(--token-space-sm)',   // 0.25rem / 4px
        'token-md': 'var(--token-space-md)',   // 0.5rem / 8px
        'token-lg': 'var(--token-space-lg)',   // 0.75rem / 12px (mobile padding)
        'token-xl': 'var(--token-space-xl)',   // 1rem / 16px
        'token-2xl': 'var(--token-space-2xl)', // 1.25rem / 20px
        'token-3xl': 'var(--token-space-3xl)', // 1.5rem / 24px (desktop padding)
        'token-4xl': 'var(--token-space-4xl)', // 2rem / 32px
        // Touch targets
        'touch-min': 'var(--min-touch-target)',           // 44px
        'touch-comfortable': 'var(--comfortable-touch-target)', // 36px
        'touch-stress': 'var(--stress-touch-target)',     // 52px
      },

      // ===== BORDER RADIUS =====
      borderRadius: {
        'token-sm': 'var(--token-radius-sm)',   // 6px
        'token-md': 'var(--token-radius-md)',   // 8px
        'token-lg': 'var(--token-radius-lg)',   // 12px
        'token-xl': 'var(--token-radius-xl)',   // 16px
        // shadcn/ui compatibility
        lg: 'var(--token-radius-lg)',
        md: 'var(--token-radius-md)',
        sm: 'var(--token-radius-sm)',
      },

      // ===== TYPOGRAPHY =====
      fontFamily: {
        sans: ['Montserrat', '-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'SF Pro Text', 'system-ui', 'sans-serif'],
        display: ['Playfair Display', 'Georgia', 'serif'],
      },
      fontSize: {
        'token-xs': ['var(--token-font-xs)', { lineHeight: '1.4' }],     // 10px
        'token-sm': ['var(--token-font-sm)', { lineHeight: '1.4' }],     // 12px
        'token-md': ['var(--token-font-md)', { lineHeight: '1.5' }],     // 14px
        'token-lg': ['var(--token-font-lg)', { lineHeight: '1.5' }],     // 16px
        'token-xl': ['var(--token-font-xl)', { lineHeight: '1.4' }],     // 18px
        'token-2xl': ['var(--token-font-2xl)', { lineHeight: '1.3' }],   // 20px
        'token-3xl': ['var(--token-font-3xl)', { lineHeight: '1.2' }],   // 24px
      },
      fontWeight: {
        'token-normal': 'var(--token-font-weight-normal)',     // 400
        'token-medium': 'var(--token-font-weight-medium)',     // 500
        'token-semibold': 'var(--token-font-weight-semibold)', // 590
        'token-bold': 'var(--token-font-weight-bold)',         // 600
        'token-extrabold': 'var(--token-font-weight-extrabold)', // 700
      },

      // ===== SHADOWS =====
      boxShadow: {
        'token-sm': 'var(--token-shadow-sm)',
        'token-md': 'var(--token-shadow-md)',
        'token-lg': 'var(--token-shadow-lg)',
        'token-xl': 'var(--token-shadow-xl)',
        'hover': 'var(--token-hover-shadow)',
        'hover-lg': 'var(--token-hover-shadow-lg)',
        'pending-glow': 'var(--pending-glow)',
      },

      // ===== TRANSITIONS =====
      transitionTimingFunction: {
        'apple': 'var(--apple-ease)',
        'apple-spring': 'var(--apple-spring)',
      },
      transitionDuration: {
        'fast': '150ms',
        'normal': '300ms',
        'slow': '500ms',
      },

      // ===== Z-INDEX =====
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

      // ===== ANIMATIONS =====
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'slide-in-from-top': {
          from: { transform: 'translateY(-100%)' },
          to: { transform: 'translateY(0)' },
        },
        'slide-in-from-bottom': {
          from: { transform: 'translateY(100%)' },
          to: { transform: 'translateY(0)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
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
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'slide-in-top': 'slide-in-from-top 0.3s var(--apple-ease)',
        'slide-in-bottom': 'slide-in-from-bottom 0.3s var(--apple-ease)',
        'fade-in': 'fade-in 0.2s ease-out',
        'slide-in-left': 'slide-in-left 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        'pulse-subtle': 'pulse-subtle 2s ease-in-out infinite',
      },

      // ===== BACKGROUNDS =====
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
