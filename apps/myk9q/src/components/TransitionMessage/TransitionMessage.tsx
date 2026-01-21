/**
 * Transition Message Component
 *
 * Shows a friendly message when redirecting users to the legacy Flutter app
 * during the migration period.
 */

import React, { useEffect } from 'react';
import { ArrowRight, Clock, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Tailwind styles for TransitionMessage */
const styles = {
  overlay: cn(
    "fixed inset-0 z-[var(--token-z-toast)]",
    "flex items-center justify-center",
    "bg-black/75 backdrop-blur-sm",
    "animate-[transitionFadeIn_0.3s_ease-out]"
  ),
  modal: cn(
    "bg-white rounded-3xl",
    "p-[var(--token-space-4xl)] sm:p-10 px-[var(--token-space-3xl)]",
    "max-w-[500px] w-[90%]",
    "shadow-[0_var(--token-space-2xl)_60px_rgba(0,0,0,0.3)]",
    "animate-[transitionSlideUp_0.4s_ease-out]"
  ),
  icon: cn(
    "w-[60px] h-[60px] sm:w-20 sm:h-20",
    "mx-auto mb-[var(--token-space-3xl)]",
    "bg-gradient-to-br from-[#667eea] to-[#764ba2]",
    "rounded-full flex items-center justify-center",
    "animate-[transitionPulse_2s_ease-in-out_infinite]"
  ),
  iconArrow: cn(
    "w-[30px] h-[30px] sm:w-10 sm:h-10",
    "text-white",
    "animate-[transitionSlideArrow_1.5s_ease-in-out_infinite]"
  ),
  title: cn(
    "text-2xl sm:text-[1.75rem] font-bold",
    "text-[var(--foreground)] text-center",
    "mb-[var(--token-space-3xl)]"
  ),
  message: "mb-[var(--token-space-4xl)]",
  messageItem: cn(
    "flex items-start gap-[var(--token-space-lg)]",
    "mb-[var(--token-space-xl)]",
    "p-[var(--token-space-lg)] sm:p-[var(--token-space-xl)]",
    "bg-[var(--muted)] rounded-xl",
    "border-l-[var(--token-space-sm)] border-l-indigo-500"
  ),
  messageItemHighlight: cn(
    "bg-blue-50 border-l-[var(--primary)]"
  ),
  messageIcon: cn(
    "w-5 h-5 shrink-0 mt-[var(--token-space-xs)]",
    "text-[var(--primary)]"
  ),
  messageText: cn(
    "m-0 leading-relaxed text-[0.9375rem]",
    "text-[var(--muted-foreground)]",
    "[&_strong]:text-[var(--foreground)] [&_strong]:font-semibold"
  ),
  actions: cn(
    "text-center mb-[var(--token-space-3xl)]"
  ),
  redirectButton: cn(
    "inline-flex items-center gap-[var(--token-space-md)]",
    "py-3.5 px-7",
    "bg-gradient-to-br from-[#667eea] to-[#764ba2]",
    "text-white border-none rounded-xl",
    "text-base font-semibold cursor-pointer",
    "transition-all duration-300",
    "shadow-[0_var(--token-space-sm)_var(--token-space-lg)_rgba(102,126,234,0.4)]",
    "mb-[var(--token-space-xl)]",
    "w-full sm:w-auto justify-center sm:justify-start",
    "hover:-translate-y-0.5 hover:shadow-[0_6px_var(--token-space-xl)_rgba(102,126,234,0.5)]",
    "active:translate-y-0"
  ),
  buttonIcon: "w-[1.125rem] h-[1.125rem]",
  autoRedirectText: cn(
    "text-sm m-0",
    "text-[var(--token-text-tertiary)]"
  ),
  countdown: "font-bold text-[var(--primary)] text-base",
  footer: cn(
    "pt-[var(--token-space-3xl)]",
    "border-t border-[var(--border)]"
  ),
  footerText: cn(
    "m-0 text-[0.8125rem] italic text-center",
    "text-[var(--token-text-muted)]"
  ),
};

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
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.icon}>
          <ArrowRight className={styles.iconArrow} />
        </div>

        <h2 className={styles.title}>Redirecting to Legacy App</h2>

        <div className={styles.message}>
          <div className={styles.messageItem}>
            <Info className={styles.messageIcon} />
            <p className={styles.messageText}>
              Your show is currently on our previous system.
            </p>
          </div>

          <div className={styles.messageItem}>
            <Clock className={styles.messageIcon} />
            <p className={styles.messageText}>
              You may need to <strong>enter your passcode again</strong> after being redirected.
            </p>
          </div>

          <div className={cn(styles.messageItem, styles.messageItemHighlight)}>
            <Info className={styles.messageIcon} />
            <p className={styles.messageText}>
              This is temporary during our transition period. Thank you for your patience!
            </p>
          </div>
        </div>

        <div className={styles.actions}>
          <button onClick={handleRedirectNow} className={styles.redirectButton}>
            Continue Now
            <ArrowRight className={styles.buttonIcon} />
          </button>

          <p className={styles.autoRedirectText}>
            Auto-redirecting in <span className={styles.countdown}>{countdown}</span> second{countdown !== 1 ? 's' : ''}...
          </p>
        </div>

        <div className={styles.footer}>
          <p className={styles.footerText}>
            Once all shows have migrated, this step will no longer be necessary.
          </p>
        </div>
      </div>
    </div>
  );
};