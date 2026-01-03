import { cva, type VariantProps } from 'class-variance-authority';

/**
 * StatusBadge variants using CVA
 *
 * Generic status badge with predefined color variants that match
 * the design system's status colors.
 */
export const statusBadgeVariants = cva(
  // Base styles
  [
    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full',
    'text-sm font-medium transition-colors',
  ],
  {
    variants: {
      variant: {
        // Neutral states
        default: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
        muted: 'bg-gray-50 text-gray-500 dark:bg-gray-900 dark:text-gray-400',

        // Check-in status colors
        'checked-in': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
        'at-gate': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
        'in-ring': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
        'scored': 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
        'conflict': 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
        'pulled': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',

        // Class status colors
        'setup': 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
        'briefing': 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400',
        'break': 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
        'in-progress': 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400',
        'completed': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',

        // Result status colors
        'qualified': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
        'not-qualified': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
        'excused': 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
        'absent': 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500',

        // Semantic colors
        success: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
        warning: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
        error: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
        info: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
      },
      size: {
        sm: 'text-xs px-2 py-1',
        default: 'text-sm px-3 py-1.5',
        lg: 'text-base px-4 py-2',
      },
      clickable: {
        true: 'cursor-pointer hover:opacity-80 active:opacity-70',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
      clickable: false,
    },
  }
);

export type StatusBadgeVariants = VariantProps<typeof statusBadgeVariants>;
