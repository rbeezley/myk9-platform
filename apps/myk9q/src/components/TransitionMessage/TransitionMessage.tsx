/**
 * Transition Message Component
 *
 * Shows a friendly message when redirecting users to the legacy Flutter app
 * during the migration period.
 */

import React, { useEffect } from 'react';
import { ArrowRight, Clock, Info } from 'lucide-react';
import './TransitionMessage.css';

interface TransitionMessageProps {
  onComplete: () => void;
  autoRedirectDelay?: number; // milliseconds
}

export const TransitionMessage: React.FC<TransitionMessageProps> = ({
  onComplete,
  autoRedirectDelay = 5000
}) => {
  const [countdown, setCountdown] = React.useState(Math.ceil(autoRedirectDelay / 1000));

  useEffect(() => {
    // Countdown timer
    const countdownInterval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownInterval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Auto-redirect after delay
    const redirectTimer = setTimeout(() => {
      onComplete();
    }, autoRedirectDelay);

    return () => {
      clearInterval(countdownInterval);
      clearTimeout(redirectTimer);
    };
  }, [onComplete, autoRedirectDelay]);

  const handleRedirectNow = () => {
    onComplete();
  };

  return (
    <div className="transition-overlay">
      <div className="transition-modal">
        <div className="transition-icon">
          <ArrowRight className="icon-arrow" />
        </div>

        <h2 className="transition-title">Redirecting to Legacy App</h2>

        <div className="transition-message">
          <div className="message-item">
            <Info className="message-icon" />
            <p>
              Your show is currently on our previous system.
            </p>
          </div>

          <div className="message-item">
            <Clock className="message-icon" />
            <p>
              You may need to <strong>enter your passcode again</strong> after being redirected.
            </p>
          </div>

          <div className="message-item info-highlight">
            <Info className="message-icon" />
            <p>
              This is temporary during our transition period. Thank you for your patience!
            </p>
          </div>
        </div>

        <div className="transition-actions">
          <button onClick={handleRedirectNow} className="redirect-button">
            Continue Now
            <ArrowRight className="button-icon" />
          </button>

          <p className="auto-redirect-text">
            Auto-redirecting in <span className="countdown">{countdown}</span> second{countdown !== 1 ? 's' : ''}...
          </p>
        </div>

        <div className="transition-footer">
          <p className="footer-text">
            Once all shows have migrated, this step will no longer be necessary.
          </p>
        </div>
      </div>
    </div>
  );
};