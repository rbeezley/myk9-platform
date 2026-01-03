/**
 * @myk9/ui - Shared UI Components for myK9 Platform
 *
 * This package provides:
 * - Design tokens (CSS variables)
 * - Tailwind preset for consistent styling
 * - Shared UI components built on Base UI
 * - Utility functions (cn, etc.)
 */

// Utilities
export { cn } from './utils/cn';

// Tailwind preset (for apps to import in their tailwind.config)
export { myk9Preset } from './tailwind-preset';

// Components - UI Primitives
export * from './components';
