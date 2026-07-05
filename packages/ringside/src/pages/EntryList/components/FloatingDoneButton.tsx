import React from 'react';
import { CheckCircle } from 'lucide-react';
import { cn } from '@myk9/ui';

export interface FloatingDoneButtonProps {
  /** Whether the button is visible */
  isVisible: boolean;
  /** Handler for clicking done */
  onClick: () => void;
}

/**
 * Floating done button for exiting drag mode.
 * Shared between EntryList and CombinedEntryList.
 */
export const FloatingDoneButton: React.FC<FloatingDoneButtonProps> = ({
  isVisible,
  onClick,
}) => {
  if (!isVisible) {
    return null;
  }

  return (
    <button
      type="button"
      // Ringside authors styling as Tailwind utilities on the markup — the
      // host app's Tailwind build scans packages/ringside/src and generates
      // these classes (see src/styles/index.css). The legacy
      // `.floating-done-button` semantic class had no matching CSS rule after
      // the Tailwind migration, so the button rendered unstyled.
      className={cn(
        // Fixed, bottom-center floating primary action.
        'fixed bottom-6 left-1/2 z-50 -translate-x-1/2',
        'inline-flex items-center gap-2 rounded-full',
        'bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground',
        'shadow-lg',
        // Enter animation (button rising from the bottom edge) + press feedback,
        // using the config's shared motion tokens. Gated on motion-reduce.
        'animate-slide-up transition-transform duration-200 ease-apple',
        'hover:scale-105 active:scale-95',
        'motion-reduce:animate-none motion-reduce:transition-none motion-reduce:hover:scale-100',
        // Keyboard focus affordance.
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      )}
      onClick={onClick}
      aria-label="Done reordering"
    >
      <CheckCircle size={20} className="shrink-0" />
      Done
    </button>
  );
};

export default FloatingDoneButton;
