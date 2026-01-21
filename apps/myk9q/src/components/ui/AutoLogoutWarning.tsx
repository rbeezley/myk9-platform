/**
 * AutoLogoutWarning Component
 *
 * Modal that appears 5 minutes before auto-logout to warn the user.
 * Allows user to extend session or logout immediately.
 */

import React, { useState, useEffect } from 'react';
import { cn } from '../../lib/utils';

interface AutoLogoutWarningProps {
  /** Seconds remaining until auto-logout */
  secondsRemaining: number;
  /** Callback when user extends session */
  onExtend: () => void;
  /** Callback when user chooses to logout now */
  onLogoutNow: () => void;
  /** Callback when modal is dismissed (user became active) */
  onDismiss: () => void;
}

export const AutoLogoutWarning: React.FC<AutoLogoutWarningProps> = ({
  secondsRemaining,
  onExtend,
  onLogoutNow,
  onDismiss,
}) => {
  const [countdown, setCountdown] = useState(secondsRemaining);

  // Update countdown when prop changes
  useEffect(() => {
    setCountdown(secondsRemaining);
  }, [secondsRemaining]);

  // Decrement countdown every second
  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Format seconds as MM:SS
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div
      className={cn(
        'fixed inset-0 z-[9999]',
        'flex items-center justify-center',
        'bg-black/50 backdrop-blur-sm',
        'animate-[fadeIn_0.2s_ease-out]'
      )}
      onClick={onDismiss}
    >
      <div
        className={cn(
          'bg-[var(--card)] rounded-xl',
          'p-6 m-4 max-w-sm w-full',
          'shadow-xl border border-[var(--border)]',
          'text-center',
          'animate-[slideUp_0.3s_ease-out]'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-4xl mb-4">⏰</div>

        <h2 className="text-xl font-semibold text-[var(--foreground)] mb-2">
          Session Ending Soon
        </h2>

        <p className="text-sm text-[var(--muted-foreground)] mb-4">
          You'll be automatically logged out in <strong className="text-[var(--foreground)]">{formatTime(countdown)}</strong> due to inactivity.
        </p>

        <div className="flex justify-center mb-6">
          <div
            className={cn(
              'w-20 h-20 rounded-full',
              'flex items-center justify-center',
              'bg-[var(--warning)]/10 border-4 border-[var(--warning)]'
            )}
          >
            <div className="text-2xl font-bold font-mono text-[var(--warning)]">
              {formatTime(countdown)}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <button
            className={cn(
              'w-full py-3 px-4 rounded-lg',
              'bg-[var(--primary)] text-white',
              'font-semibold',
              'hover:brightness-110 transition-all'
            )}
            onClick={onExtend}
          >
            Stay Logged In
          </button>

          <button
            className={cn(
              'w-full py-3 px-4 rounded-lg',
              'bg-[var(--muted)] text-[var(--foreground)]',
              'font-medium',
              'hover:bg-[var(--muted)]/80 transition-all'
            )}
            onClick={onLogoutNow}
          >
            Logout Now
          </button>
        </div>

        <p className="text-xs text-[var(--muted-foreground)] mt-4">
          Any activity will keep you logged in
        </p>
      </div>
    </div>
  );
};
