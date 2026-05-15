/**
 * Date formatting helpers for Monogram surfaces.
 * All formatting respects the trial's IANA timezone.
 *
 * Mirrors features/heritage/landing/utils/dateFormat.ts verbatim — kept as a
 * sibling rather than imported across feature boundaries to keep Monogram
 * self-contained for future style-level refactors.
 */

export function formatDateInTimezone(
  iso: string,
  timezone: string,
  format: 'short' | 'long' | 'time' | 'monthDay'
): string {
  try {
    const date = new Date(iso);
    if (isNaN(date.getTime())) return '';

    const opts: Intl.DateTimeFormatOptions = { timeZone: timezone };

    if (format === 'short') {
      return date.toLocaleDateString('en-US', {
        ...opts,
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    }
    if (format === 'long') {
      return date.toLocaleDateString('en-US', {
        ...opts,
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
    }
    if (format === 'time') {
      return date.toLocaleTimeString('en-US', {
        ...opts,
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
      });
    }
    if (format === 'monthDay') {
      return date.toLocaleDateString('en-US', {
        ...opts,
        month: 'short',
        day: 'numeric',
      });
    }
    return '';
  } catch {
    return iso;
  }
}

/** Format a range like "Jun 12–14" when both dates fall in one month, or
 *  "Jun 30 – Jul 2" when they span months. Returns just the start date if end
 *  is missing or equal. */
export function formatDateRange(
  startIso: string | null,
  endIso: string | null,
  timezone: string
): string {
  if (!startIso) return '';
  const start = new Date(startIso);
  const end = endIso ? new Date(endIso) : null;
  if (isNaN(start.getTime())) return '';

  const startMonth = start.toLocaleDateString('en-US', { timeZone: timezone, month: 'short' });
  const startDay = start.toLocaleDateString('en-US', { timeZone: timezone, day: 'numeric' });

  if (!end || isNaN(end.getTime()) || endIso === startIso) {
    return `${startMonth} ${startDay}`;
  }

  const endMonth = end.toLocaleDateString('en-US', { timeZone: timezone, month: 'short' });
  const endDay = end.toLocaleDateString('en-US', { timeZone: timezone, day: 'numeric' });

  if (startMonth === endMonth) {
    return `${startMonth} ${startDay}–${endDay}`;
  }
  return `${startMonth} ${startDay} – ${endMonth} ${endDay}`;
}
