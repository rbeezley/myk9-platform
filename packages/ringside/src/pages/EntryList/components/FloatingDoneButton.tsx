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
 * Used by both entry-list modes (single class and combined A/B).
 */
export const FloatingDoneButton: React.FC<FloatingDoneButtonProps> = ({
  isVisible,
  onClick,
}) => {
  if (!isVisible) {
    return null;
  }

  return (
    // Ringside authors styling as Tailwind utilities on the markup — the host
    // app's Tailwind build scans packages/ringside/src and generates these
    // classes (see src/styles/index.css). The legacy `.floating-done-button`
    // semantic class had no matching CSS rule after the Tailwind migration, so
    // the button rendered unstyled.
    //
    // Two layers on purpose: the `animate-slide-up` token animates `transform`
    // with `forwards` fill, so it CANNOT share an element with transform-based
    // centering (`-translate-x-1/2`) or the hover/active scale — the animation
    // would overwrite them. The wrapper centers via flexbox (no transform) and
    // owns the entrance animation; the button owns its own scale transform.
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center animate-slide-up motion-reduce:animate-none">
      <button
        type="button"
        className={cn(
          'pointer-events-auto inline-flex items-center gap-2 rounded-full',
          'bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground',
          'shadow-lg',
          // Press feedback (config's shared easing token), gated on motion-reduce.
          'transition-transform duration-200 ease-apple hover:scale-105 active:scale-95',
          'motion-reduce:transition-none motion-reduce:hover:scale-100',
          // Keyboard focus affordance.
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        )}
        onClick={onClick}
        aria-label="Done reordering"
      >
        <CheckCircle size={20} className="shrink-0" />
        Done
      </button>
    </div>
  );
};

export default FloatingDoneButton;
