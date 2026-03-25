/**
 * Design Token Utilities
 * Provides easy access to standardized design tokens from our design system
 */

import designTokens from '../../docs/style-guides/design-tokens.json';

// Export design tokens for easy access
export const tokens = designTokens;

// Utility functions for common design token usage
export const spacing = {
  ...designTokens.spacing,
  // Helper functions
  px: (value: keyof typeof designTokens.spacing) => designTokens.spacing[value],
  get: (value: string) => designTokens.spacing[value as keyof typeof designTokens.spacing] || value,
};

export const colors = {
  ...designTokens.colors,
  // Helper functions for CSS custom properties
  getCSSVar: (path: string) => `var(--${path})`,
  semantic: designTokens.colors.semantic,
  primary: designTokens.colors.primary,
};

export const typography = {
  ...designTokens.typography,
  // Helper to get font size object
  getFontSize: (size: keyof typeof designTokens.typography.fontSize) =>
    designTokens.typography.fontSize[size],
};

export const radius = {
  ...designTokens.borderRadius,
  get: (value: keyof typeof designTokens.borderRadius) => designTokens.borderRadius[value],
};

export const shadows = {
  ...designTokens.shadows,
  get: (value: keyof typeof designTokens.shadows) => designTokens.shadows[value],
};

export const animation = {
  ...designTokens.animation,
  easing: designTokens.animation.easing,
  duration: designTokens.animation.duration,
};

// Component-specific token helpers
export const componentTokens = {
  button: designTokens.components.button,
  card: designTokens.components.card,
  dialog: designTokens.components.dialog,
  input: designTokens.components.input,
  tabs: designTokens.components.tabs,
};

// Common CSS class builders
export const buildClasses = {
  card: {
    base: 'bg-card border border-border/50 rounded-xl shadow-card backdrop-blur-sm transition-all duration-300',
    hover: 'hover:shadow-card-hover hover:-translate-y-0.5',
    standard:
      'bg-card border border-border/50 rounded-xl p-6 shadow-card backdrop-blur-sm transition-all duration-300 hover:shadow-card-hover hover:-translate-y-0.5',
  },
  button: {
    primary:
      'bg-primary text-primary-foreground hover:opacity-90 hover:-translate-y-0.5 transition-all duration-200',
    secondary: 'border-primary/20 text-primary hover:bg-primary/5 hover:border-primary/40',
    ghost: 'text-primary hover:bg-primary/10',
  },
  emptyState: {
    container: 'flex flex-col items-center justify-center py-12 text-center',
    icon: 'bg-muted/50 rounded-full p-6 mb-4',
    iconSize: 'h-12 w-12',
    title: 'text-lg font-semibold mb-2',
    description: 'text-muted-foreground mb-6 max-w-sm',
  },
};

// Status color helpers
export const statusColors = designTokens.statusColors;

export const getStatusClasses = (status: keyof typeof designTokens.statusColors) => {
  const statusColor = designTokens.statusColors[status];
  if (!statusColor) return '';

  return `inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border`;
};

// Layout helpers
export const layout = {
  container: 'container mx-auto px-6 max-w-7xl',
  page: 'min-h-screen bg-background py-20',
  section: 'space-y-8',
  grid: {
    responsive: 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    two: 'grid grid-cols-1 lg:grid-cols-2',
  },
};

export default {
  tokens,
  spacing,
  colors,
  typography,
  radius,
  shadows,
  animation,
  componentTokens,
  buildClasses,
  statusColors,
  getStatusClasses,
  layout,
};
