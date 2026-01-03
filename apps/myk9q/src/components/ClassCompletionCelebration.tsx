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
import './ClassCompletionCelebration.css';

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
    <div className="celebration-overlay" onClick={onClose}>
      <div className="celebration-modal" onClick={(e) => e.stopPropagation()}>
        <div className="celebration-content">
          <div className="celebration-icon">🎉</div>
          <h2 className="celebration-title">Congratulations!</h2>
          <p className="celebration-message">
            You've completed <strong>{className}</strong>
          </p>
          <div className="celebration-stats">
            <div className="celebration-stat">
              <div className="celebration-stat-value">{totalDogs}</div>
              <div className="celebration-stat-label">
                dog{totalDogs !== 1 ? 's' : ''} scored
              </div>
            </div>
            {duration && (
              <div className="celebration-stat">
                <div className="celebration-stat-value">{duration}</div>
                <div className="celebration-stat-label">total time</div>
              </div>
            )}
            <div className="celebration-stat">
              <div className="celebration-stat-value">{passRate}%</div>
              <div className="celebration-stat-label">pass rate</div>
            </div>
          </div>
          <button className="celebration-close-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
