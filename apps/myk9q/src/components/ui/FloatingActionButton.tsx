/**
 * Floating Action Button (FAB)
 *
 * Material Design-inspired FAB for one-handed mode.
 * Positioned based on hand preference (left/right/auto).
 */

import React from 'react';
import './shared-ui.css';

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
  className = '',
  visible = true,
}) => {
  // Don't render if FAB is hidden
  if (!visible) {
    return null;
  }

  return (
    <button
      className={`floating-action-button ${className}`}
      onClick={onClick}
      aria-label={ariaLabel}
      type="button"
    >
      {icon}
    </button>
  );
};
