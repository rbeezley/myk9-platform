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
 *
 * Styled with Tailwind utilities on the markup (the ringside styling idiom —
 * the host app's Tailwind build scans packages/ringside/src). Motion uses the
 * shared motion tokens (`duration-enter`/`ease-enter`) and is gated on
 * `prefers-reduced-motion` via the `motion-reduce:` variant. The element stays
 * mounted and toggles opacity/translate so it both fades+rises IN and fades OUT
 * (a conditional unmount could only animate the enter).
 */
export const SuccessToast: React.FC<SuccessToastProps> = ({
  isVisible,
  message,
}) => {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-hidden={!isVisible}
      data-visible={isVisible}
      className={cn(
        'pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] z-50',
        'mx-auto flex w-fit items-center gap-2 rounded-full px-5 py-3',
        'bg-success text-sm font-semibold text-success-foreground shadow-lg',
        'transition duration-enter ease-enter motion-reduce:transition-none',
        isVisible
          ? 'translate-y-0 opacity-100'
          : 'invisible translate-y-2 opacity-0'
      )}
    >
      <CheckCircle
        size={20}
        style={{ width: '20px', height: '20px', flexShrink: 0 }}
      />
      <span>{message}</span>
    </div>
  );
};

export default SuccessToast;
