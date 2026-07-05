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
    <div
      role="status"
      aria-live="polite"
      // Ringside authors styling as Tailwind utilities on the markup — the
      // host app's Tailwind build scans packages/ringside/src and generates
      // these classes (see src/styles/index.css). The legacy `.success-toast`
      // semantic class had no matching CSS rule after the Tailwind migration,
      // so the toast rendered unstyled. Positioned top-center to clear the
      // bottom-center FloatingDoneButton, which can render at the same time.
      className={cn(
        'fixed top-6 left-1/2 z-50 -translate-x-1/2',
        'inline-flex items-center gap-2 rounded-full',
        'bg-success px-4 py-3 text-sm font-medium text-success-foreground',
        'shadow-lg',
        // Enter animation, using the config's shared motion tokens. Gated on
        // motion-reduce.
        'animate-slide-up transition-transform duration-200 ease-apple',
        'motion-reduce:animate-none motion-reduce:transition-none',
      )}
    >
      <CheckCircle size={20} className="shrink-0" />
      <span>{message}</span>
    </div>
  );
};

export default SuccessToast;
