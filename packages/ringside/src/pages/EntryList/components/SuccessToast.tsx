import React from 'react';
import { CheckCircle } from 'lucide-react';
import { cn } from '@myk9/ui';

export interface SuccessToastProps {
  /** Whether the toast is visible */
  isVisible: boolean;
  /** Message to display */
  message: string;
}

/**
 * Success toast notification for entry list actions.
 * Used by both entry-list modes (single class and combined A/B).
 *
 * Ringside authors styling as Tailwind utilities on the markup — the host app's
 * Tailwind build scans packages/ringside/src and generates these classes (see
 * src/styles/index.css). The legacy `.success-toast` semantic class had no
 * matching CSS rule after the Tailwind migration, so the toast rendered
 * unstyled.
 *
 * Conditionally rendered (returns null when hidden) so the `role="status"` live
 * region mounts fresh with its message each time — that is what makes screen
 * readers announce the success. Positioned top-center to clear the bottom-center
 * FloatingDoneButton, which can render at the same time.
 *
 * The wrapper centers via flexbox (NOT `-translate-x-1/2`) so the entrance
 * animation — which animates `transform` — cannot overwrite the horizontal
 * centering. Motion follows the shared motion language: a fade + small rise over
 * `duration-enter` with `ease-enter` (no bounce), gated on reduced motion.
 */
export const SuccessToast: React.FC<SuccessToastProps> = ({
  isVisible,
  message,
}) => {
  if (!isVisible) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 top-6 z-50 flex justify-center animate-in fade-in slide-in-from-top-2 duration-enter ease-enter motion-reduce:animate-none">
      <div
        role="status"
        aria-live="polite"
        className={cn(
          'inline-flex items-center gap-2 rounded-full',
          'bg-success px-4 py-3 text-sm font-medium text-success-foreground',
          'shadow-lg',
        )}
      >
        <CheckCircle size={20} className="shrink-0" />
        <span>{message}</span>
      </div>
    </div>
  );
};

export default SuccessToast;
