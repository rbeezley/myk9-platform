export const STAT_COLORS = {
  primary: {
    iconBg: 'bg-indigo-500/8 dark:bg-indigo-500/12',
    iconStroke: 'text-indigo-500',
    progressFill: 'bg-indigo-500',
  },
  emerald: {
    iconBg: 'bg-emerald-500/8 dark:bg-emerald-500/12',
    iconStroke: 'text-emerald-500',
    progressFill: 'bg-emerald-500',
  },
  amber: {
    iconBg: 'bg-amber-500/8 dark:bg-amber-500/12',
    iconStroke: 'text-amber-500',
    progressFill: 'bg-amber-500',
  },
  red: {
    iconBg: 'bg-red-500/8 dark:bg-red-500/12',
    iconStroke: 'text-red-500',
    progressFill: 'bg-red-500',
  },
  purple: {
    iconBg: 'bg-violet-500/8 dark:bg-violet-500/12',
    iconStroke: 'text-violet-500',
    progressFill: 'bg-violet-500',
  },
  blue: {
    iconBg: 'bg-blue-500/8 dark:bg-blue-500/12',
    iconStroke: 'text-blue-500',
    progressFill: 'bg-blue-500',
  },
} as const;

export type StatColor = keyof typeof STAT_COLORS;
