import { useEffect, useState } from 'react';

/** "Now", ticking once a minute so a show-day gate opens without a reload; a fixed date for tests. */
export function useMinuteClock(fixed?: Date | null): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (fixed) return undefined;
    const interval = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(interval);
  }, [fixed]);
  return fixed ?? now;
}
