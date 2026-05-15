/**
 * Date formatting helpers for Banner surfaces. Mirrors the Monogram /
 * Heritage helpers — kept as a sibling rather than imported across feature
 * boundaries so the Banner feature stays self-contained.
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
      return date.toLocaleDateString('en-US', { ...opts, month: 'short', day: 'numeric' });
    }
    return '';
  } catch {
    return iso;
  }
}

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
