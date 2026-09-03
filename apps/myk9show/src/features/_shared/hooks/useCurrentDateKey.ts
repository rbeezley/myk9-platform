import { useEffect, useState } from 'react';

function getCurrentDateKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function millisecondsUntilNextLocalMidnight(now: Date = new Date()): number {
  const nextMidnight = new Date(now);
  nextMidnight.setHours(24, 0, 0, 0);
  return Math.max(1, nextMidnight.getTime() - now.getTime());
}

/** Re-renders once when the viewer's local calendar day changes. */
export function useCurrentDateKey(): string {
  const [dateKey, setDateKey] = useState(() => getCurrentDateKey());
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    const scheduleNextMidnight = () => {
      timeoutId = setTimeout(() => {
        setDateKey(getCurrentDateKey());
        scheduleNextMidnight();
      }, millisecondsUntilNextLocalMidnight());
    };
    scheduleNextMidnight();
    return () => clearTimeout(timeoutId);
  }, []);
  return dateKey;
}
