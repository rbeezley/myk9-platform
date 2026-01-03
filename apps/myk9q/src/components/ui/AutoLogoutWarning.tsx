/**
 * AutoLogoutWarning Component
 *
 * Modal that appears 5 minutes before auto-logout to warn the user.
 * Allows user to extend session or logout immediately.
 */

import React, { useState, useEffect } from 'react';
import './shared-ui.css';

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
    <div className="auto-logout-overlay" onClick={onDismiss}>
      <div className="auto-logout-modal" onClick={(e) => e.stopPropagation()}>
        <div className="auto-logout-icon">⏰</div>

        <h2 className="auto-logout-title">Session Ending Soon</h2>

        <p className="auto-logout-message">
          You'll be automatically logged out in <strong>{formatTime(countdown)}</strong> due to inactivity.
        </p>

        <div className="auto-logout-countdown">
          <div className="countdown-circle">
            <div className="countdown-number">{formatTime(countdown)}</div>
          </div>
        </div>

        <div className="auto-logout-actions">
          <button
            className="auto-logout-button extend"
            onClick={onExtend}
          >
            Stay Logged In
          </button>

          <button
            className="auto-logout-button logout"
            onClick={onLogoutNow}
          >
            Logout Now
          </button>
        </div>

        <p className="auto-logout-hint">
          Any activity will keep you logged in
        </p>
      </div>
    </div>
  );
};
