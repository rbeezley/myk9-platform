import * as React from 'react';
import { cn } from '../../utils/cn';

export type WarningBannerVariant = 'offline' | 'stale' | 'warning' | 'info';

export interface WarningBannerProps {
  /** The warning message */
  message: string;
  /** Visual variant */
  variant?: WarningBannerVariant;
  /** Icon to display */
  icon?: React.ReactNode;
  /** Additional className */
  className?: string;
}

const variantClasses: Record<WarningBannerVariant, string> = {
  offline: 'bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-400',
  stale: 'bg-yellow-500/12 border-yellow-500/35 text-yellow-700 dark:text-yellow-400',
  warning: 'bg-orange-500/15 border-orange-500/40 text-orange-700 dark:text-orange-400',
  info: 'bg-blue-500/15 border-blue-500/40 text-blue-700 dark:text-blue-400',
};

/**
 * WarningBanner Component
 *
 * Compact warning banner for use in ClassCard and other components.
 *
 * @example
 * ```tsx
 * <WarningBanner
 *   variant="offline"
 *   message="Offline - updates when reconnected"
 *   icon={<WifiOff size={10} />}
 * />
 * ```
 */
export const WarningBanner: React.FC<WarningBannerProps> = ({
  message,
  variant = 'warning',
  icon,
  className,
}) => {
  return (
    <div
      className={cn(
        'flex items-center gap-1 px-2 py-1',
        'rounded-sm border',
        'text-[10px] leading-tight',
        'whitespace-nowrap overflow-hidden text-ellipsis',
        variantClasses[variant],
        className
      )}
    >
      {icon && <span className="flex-shrink-0 w-2.5 h-2.5">{icon}</span>}
      <span>{message}</span>
    </div>
  );
};
