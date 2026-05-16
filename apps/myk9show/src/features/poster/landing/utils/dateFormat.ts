/**
 * Date formatting helpers for Poster surfaces. Mirrors the Banner /
 * Monogram / Heritage helpers — kept as a sibling rather than imported
 * across feature boundaries so the Poster feature stays self-contained.
 *
 * Poster also exposes an UPPERCASE-month variant (`monthDayUpper`) for
 * mono-strip and section labels where the design calls for "JUN 12—14".
 */

export function formatDateInTimezone(
  iso: string,
  timezone: string,
  format: 'short' | 'long' | 'time' | 'monthDay' | 'monthDayUpper'
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
    if (format === 'monthDayUpper') {
      return date
        .toLocaleDateString('en-US', { ...opts, month: 'short', day: 'numeric' })
        .toUpperCase();
    }
    return '';
  } catch {
    return iso;
  }
}

export function formatDateRange(
  startIso: string | null,
  endIso: string | null,
  timezone: string,
  uppercase: boolean = false
): string {
  if (!startIso) return '';
  const start = new Date(startIso);
  const end = endIso ? new Date(endIso) : null;
  if (isNaN(start.getTime())) return '';

  const startMonth = start.toLocaleDateString('en-US', { timeZone: timezone, month: 'short' });
  const startDay = start.toLocaleDateString('en-US', { timeZone: timezone, day: 'numeric' });

  const apply = (s: string) => (uppercase ? s.toUpperCase() : s);

  if (!end || isNaN(end.getTime()) || endIso === startIso) {
    return apply(`${startMonth} ${startDay}`);
  }

  const endMonth = end.toLocaleDateString('en-US', { timeZone: timezone, month: 'short' });
  const endDay = end.toLocaleDateString('en-US', { timeZone: timezone, day: 'numeric' });

  if (startMonth === endMonth) {
    return apply(`${startMonth} ${startDay}—${endDay}`);
  }
  return apply(`${startMonth} ${startDay} – ${endMonth} ${endDay}`);
}

/** Pad a trial number as zero-padded 2-digit "01", "02", … */
export function padTrialNumber(n: number | string): string {
  const num = typeof n === 'number' ? n : parseInt(String(n), 10);
  if (isNaN(num)) return String(n);
  return num.toString().padStart(2, '0');
}
