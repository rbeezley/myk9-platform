/** Format seconds as M:SS.HH */
export function formatTime(seconds: number | null): string {
  if (seconds == null) return '\u2014';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const wholeSecs = Math.floor(secs);
  const hundredths = Math.round((secs - wholeSecs) * 100);
  return `${mins}:${String(wholeSecs).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
}
