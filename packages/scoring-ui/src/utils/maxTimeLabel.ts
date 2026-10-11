/**
 * A class's max search time as the scoresheet shows it: "3:00", or "Not set"
 * when the class has none (0) -- never "0:00", which reads as a real limit.
 */
export function maxTimeLabel(maxTimeSeconds: number): string {
  if (!(maxTimeSeconds > 0)) return 'Not set';
  return `${Math.floor(maxTimeSeconds / 60)}:${String(maxTimeSeconds % 60).padStart(2, '0')}`;
}

/**
 * The line under a running or stopped search clock. With no limit there is
 * nothing remaining to count down -- "Remaining: 0:00.00" would read as expired.
 */
export function timerLimitLine(
  elapsedMs: number,
  maxTimeSeconds: number,
  remainingText: string
): string {
  if (!(maxTimeSeconds > 0)) return 'Max Time: Not set';
  return elapsedMs > 0
    ? `Remaining: ${remainingText}`
    : `Max Time: ${maxTimeLabel(maxTimeSeconds)}`;
}
