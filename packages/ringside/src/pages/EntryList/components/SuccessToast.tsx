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
 * Shared between EntryList and CombinedEntryList.
 */
export const SuccessToast: React.FC<SuccessToastProps> = ({
  isVisible,
  message,
}) => {
  if (!isVisible) {
    return null;
  }

  return (
    // Ringside authors styling as Tailwind utilities on the markup — the host
    // app's Tailwind build scans packages/ringside/src and generates these
    // classes (see src/styles/index.css). The legacy `.success-toast` semantic
    // class had no matching CSS rule after the Tailwind migration, so the toast
    // rendered unstyled. Positioned top-center to clear the bottom-center
    // FloatingDoneButton, which can render at the same time.
    //
    // The wrapper centers via flexbox (NOT `-translate-x-1/2`) so the
    // `animate-slide-up` token — which animates `transform` with `forwards`
    // fill — cannot overwrite the horizontal centering.
    <div className="pointer-events-none fixed inset-x-0 top-6 z-50 flex justify-center animate-slide-up motion-reduce:animate-none">
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
