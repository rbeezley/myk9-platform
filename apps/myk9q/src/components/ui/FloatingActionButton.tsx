/**
 * FloatingActionButton Component - Migrated to Tailwind CSS
 *
 * Material Design-inspired FAB for one-handed mode.
 * Positioned based on hand preference (left/right/auto).
 */

import React from 'react';
import { cn } from '../../lib/utils';

export interface FloatingActionButtonProps {
  /** Icon to display in the FAB */
  icon: React.ReactNode;
  /** Click handler */
  onClick: () => void;
  /** Accessible label */
  ariaLabel: string;
  /** Optional CSS class */
  className?: string;
  /** Whether to show the FAB (default: true) */
  visible?: boolean;
  /** Position preference: 'left' | 'right' */
  position?: 'left' | 'right';
}

/**
 * Floating Action Button component
 *
 * Automatically positions based on settings.handPreference:
 * - 'left': Bottom left corner
 * - 'right': Bottom right corner
 * - 'auto': Bottom right (default for right-handed majority)
 */
// Haptic feedback is handled globally by useGlobalHaptic hook
export const FloatingActionButton: React.FC<FloatingActionButtonProps> = ({
  icon,
  onClick,
  ariaLabel,
  className,
  visible = true,
  position = 'right',
}) => {
  // Don't render if FAB is hidden
  if (!visible) {
    return null;
  }

  return (
    <button
      className={cn(
        'fixed bottom-6 z-50',
        'w-14 h-14',
        'flex items-center justify-center',
        'rounded-full',
        'bg-[var(--primary)] text-white',
        'shadow-lg',
        'border-none cursor-pointer',
        'transition-all duration-300',
        'hover:-translate-y-1 hover:shadow-xl',
        'active:scale-95',
        position === 'left' ? 'left-6' : 'right-6',
        // Safe area padding for notched devices
        'pb-[env(safe-area-inset-bottom,0)]',
        className
      )}
      onClick={onClick}
      aria-label={ariaLabel}
      type="button"
    >
      {icon}
    </button>
  );
};
