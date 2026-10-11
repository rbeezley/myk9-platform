/**
 * A class's max search time as the scoresheet shows it: "3:00", or "Not set"
 * when the class has none (0) -- never "0:00", which reads as a real limit.
 */
export function maxTimeLabel(maxTimeSeconds: number): string {
  if (!(maxTimeSeconds > 0)) return 'Not set';
  return `${Math.floor(maxTimeSeconds / 60)}:${String(maxTimeSeconds % 60).padStart(2, '0')}`;
}
