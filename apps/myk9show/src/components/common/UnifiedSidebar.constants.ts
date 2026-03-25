// Soft Modern design tokens - warm, approachable, polished
// Uses CSS variable --primary for dynamic accent color support
export const SIDEBAR_TOKENS = {
  collapsed: {
    width: '80px',
    minWidth: '5rem',
  },
  expanded: {
    width: '240px',
    minWidth: '12.5rem',
  },
  heights: {
    header: '64px',
    search: '48px',
    groupHeader: '32px',
    item: '44px',
  },
  colors: {
    // Use CSS variable for seamless integration with page background
    container: 'bg-[var(--sidebar)]',
    border: 'border-slate-200/60 dark:border-slate-800/60',
    // Header with subtle depth - transparent to inherit sidebar background
    header: 'bg-transparent border-b border-slate-200/20 dark:border-slate-800/20',
    // Elevated search with glass effect
    search:
      'bg-background/90 dark:bg-slate-800/90 border-slate-200/60 dark:border-slate-700/60 backdrop-blur-md',
    item: {
      // Subtle hover state - uses primary accent color
      default:
        'text-slate-600 dark:text-slate-400 hover:bg-primary/10 hover:text-slate-900 dark:hover:text-slate-200',
      // Primary accent color for selected state
      selected: 'bg-primary/15 dark:bg-primary/20 text-primary shadow-sm border-l-2 border-primary',
      // Collapsed state
      collapsed: 'hover:bg-primary/10 text-slate-500 dark:text-slate-400 hover:text-primary',
    },
    text: {
      primary: 'text-slate-900 dark:text-slate-100',
      secondary: 'text-slate-500 dark:text-slate-400',
      selected: 'text-primary font-medium',
      groupHeader:
        'text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider',
    },
  },
  // Spring-like animation curve for bouncy micro-interactions
  transitions: {
    default: 'transition-all duration-300 ease-bounce',
    fast: 'transition-all duration-200 ease-bounce',
    slow: 'transition-all duration-500 ease-bounce',
  },
} as const;
