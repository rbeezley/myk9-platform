/**
 * ClassCompletionCelebration - Congratulatory modal shown when a class is completed
 *
 * Displays confetti animation and class completion statistics including:
 * - Total number of dogs scored
 * - Time taken from first to last dog
 * - Congratulatory message for the judge
 */

import { useEffect, useMemo } from 'react';
import confetti from 'canvas-confetti';
import { cn } from '@/lib/utils';

/** Tailwind styles for ClassCompletionCelebration */
const styles = {
  overlay: cn(
    "fixed inset-0 z-[var(--token-z-toast)]",
    "flex items-center justify-center",
    "bg-black/70",
    "animate-[celebrationFadeIn_0.3s_ease-in-out]",
    "motion-reduce:animate-none"
  ),
  modal: cn(
    "bg-[var(--background)] rounded-2xl",
    "p-[var(--token-space-4xl)]",
    "w-[90%] max-w-[500px]",
    "shadow-[0_20px_60px_var(--shadow-medium)]",
    "animate-[celebrationSlideUp_0.4s_ease-out]",
    "sm:w-[85%] lg:w-auto",
    "motion-reduce:animate-none"
  ),
  content: "text-center",
  icon: cn(
    "text-[4rem] mb-[var(--token-space-xl)]",
    "animate-[celebrationBounce_1s_ease-in-out_infinite]",
    "motion-reduce:animate-none"
  ),
  title: cn(
    "text-[2rem] font-bold",
    "text-[var(--foreground)]",
    "m-0 mb-[var(--token-space-lg)]"
  ),
  message: cn(
    "text-lg text-[var(--muted-foreground)]",
    "m-0 mb-[var(--token-space-3xl)]",
    "[&_strong]:text-[var(--foreground)] [&_strong]:font-semibold"
  ),
  stats: cn(
    "flex flex-wrap gap-[var(--token-space-3xl)]",
    "justify-center",
    "mb-[var(--token-space-4xl)]"
  ),
  stat: cn(
    "flex flex-col items-center",
    "gap-[var(--token-space-md)]"
  ),
  statValue: cn(
    "text-[2.5rem] font-bold leading-none",
    "text-[var(--primary)]"
  ),
  statLabel: cn(
    "text-sm uppercase tracking-[0.05em]",
    "text-[var(--muted-foreground)]"
  ),
  closeBtn: cn(
    "bg-[var(--primary)] text-[var(--primary-foreground)]",
    "border-none rounded-lg",
    "px-[var(--token-space-4xl)] py-[var(--token-space-lg)]",
    "text-base font-semibold cursor-pointer",
    "transition-all duration-200",
    "hover:bg-[var(--primary-hover)] hover:-translate-y-0.5",
    "hover:shadow-[0_4px_12px_var(--shadow-light)]",
    "active:translate-y-0",
    "motion-reduce:hover:translate-y-0"
  ),
};

interface ClassCompletionCelebrationProps {
  isOpen: boolean;
  onClose: () => void;
  className: string;
  totalDogs: number;
  qualifiedDogs: number;
  actualStartTime: string;
  actualEndTime: string;
}

export function ClassCompletionCelebration({
  isOpen,
  onClose,
  className,
  totalDogs,
  qualifiedDogs,
  actualStartTime,
  actualEndTime,
}: ClassCompletionCelebrationProps) {
  // Calculate duration - memoized to avoid recalculation
  const duration = useMemo(() => {
    if (!actualStartTime || !actualEndTime) return '';

    const start = new Date(actualStartTime);
    const end = new Date(actualEndTime);
    const diffMs = end.getTime() - start.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const hours = Math.floor(diffMins / 60);
    const minutes = diffMins % 60;

    if (hours > 0) {
      return `${hours} hour${hours !== 1 ? 's' : ''} and ${minutes} minute${minutes !== 1 ? 's' : ''}`;
    }
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  }, [actualStartTime, actualEndTime]);

  // Calculate pass rate - memoized
  const passRate = useMemo(() => {
    if (totalDogs === 0) return 0;
    return Math.round((qualifiedDogs / totalDogs) * 100);
  }, [totalDogs, qualifiedDogs]);

  useEffect(() => {
    if (isOpen) {

      // Fire confetti animation
      const duration = 3000;
      const animationEnd = Date.now() + duration;
      const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 10000 };

      function randomInRange(min: number, max: number) {
        return Math.random() * (max - min) + min;
      }

      const interval = setInterval(() => {
        const timeLeft = animationEnd - Date.now();

        if (timeLeft <= 0) {
          clearInterval(interval);
          return;
        }

        const particleCount = 50 * (timeLeft / duration);

        // Fire confetti from different positions
        confetti({
          ...defaults,
          particleCount,
          origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
        });
        confetti({
          ...defaults,
          particleCount,
          origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
        });
      }, 250);

      return () => clearInterval(interval);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.content}>
          <div className={styles.icon}>🎉</div>
          <h2 className={styles.title}>Congratulations!</h2>
          <p className={styles.message}>
            You've completed <strong>{className}</strong>
          </p>
          <div className={styles.stats}>
            <div className={styles.stat}>
              <div className={styles.statValue}>{totalDogs}</div>
              <div className={styles.statLabel}>
                dog{totalDogs !== 1 ? 's' : ''} scored
              </div>
            </div>
            {duration && (
              <div className={styles.stat}>
                <div className={styles.statValue}>{duration}</div>
                <div className={styles.statLabel}>total time</div>
              </div>
            )}
            <div className={styles.stat}>
              <div className={styles.statValue}>{passRate}%</div>
              <div className={styles.statLabel}>pass rate</div>
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
