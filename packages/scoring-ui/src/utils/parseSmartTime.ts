/**
 * Parse a loosely-typed time input into "M:SS.ss" format.
 *
 * Supports:
 * - "1:23.45" → "1:23.45" (already formatted)
 * - "1:23" → "1:23.00" (add hundredths)
 * - "123" → "1:23.00" (raw seconds)
 * - "45" → "0:45.00" (raw seconds under 60)
 * - "45.5" → "0:45.50" (raw seconds with decimal)
 * - "" → "" (empty)
 * - "abc" → "" (invalid)
 */
export function parseSmartTime(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';

  // Already in M:SS.ss format
  if (/^\d+:\d{2}\.\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  // M:SS format — add .00
  if (/^\d+:\d{2}$/.test(trimmed)) {
    return `${trimmed}.00`;
  }

  // Integer with 3+ digits: if last 2 digits are a valid non-zero seconds value
  // (01–59), treat as MMSS digit-split (secretary shorthand, e.g. "123" → 1:23).
  // Otherwise fall through and treat as total seconds (e.g. "300" → 5:00).
  if (/^\d{3,}$/.test(trimmed)) {
    const lastTwo = parseInt(trimmed.slice(-2), 10);
    if (lastTwo >= 1 && lastTwo <= 59) {
      const mins = parseInt(trimmed.slice(0, -2), 10);
      return `${mins}:${lastTwo.toFixed(2).padStart(5, '0')}`;
    }
  }

  // Raw number (possibly with decimal) — interpret as total seconds
  const totalSeconds = parseFloat(trimmed);
  if (isNaN(totalSeconds)) return '';

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toFixed(2).padStart(5, '0')}`;
}
