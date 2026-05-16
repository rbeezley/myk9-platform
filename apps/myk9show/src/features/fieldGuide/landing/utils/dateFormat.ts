/**
 * Date formatting helpers for Field Guide surfaces. Mirrors the
 * Banner / Monogram helpers — kept as a sibling rather than imported
 * across feature boundaries so the Field Guide feature stays
 * self-contained.
 *
 * Field Guide leans toward terse, reference-document formatting:
 * "JUN 12–14" instead of "Friday, June 12 – Sunday, June 14, 2026".
 */

export function formatDateInTimezone(
  iso: string,
  timezone: string,
  format: 'short' | 'long' | 'time' | 'monthDay' | 'iso'
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
      // Field Guide style: "JUN 12" (uppercase + no padding zero).
      return date
        .toLocaleDateString('en-US', { ...opts, month: 'short', day: 'numeric' })
        .toUpperCase();
    }
    if (format === 'iso') {
      // Render as YYYY-MM-DD in the trial timezone for the mono-spec rows.
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(date);
      return parts;
    }
    return '';
  } catch {
    return iso;
  }
}

/** "JUN 12–14" or "MAY 31 – JUN 02" if the months differ. Uppercase. */
export function formatDateRange(
  startIso: string | null,
  endIso: string | null,
  timezone: string
): string {
  if (!startIso) return '';
  const start = new Date(startIso);
  const end = endIso ? new Date(endIso) : null;
  if (isNaN(start.getTime())) return '';

  const startMonth = start
    .toLocaleDateString('en-US', { timeZone: timezone, month: 'short' })
    .toUpperCase();
  const startDay = start.toLocaleDateString('en-US', { timeZone: timezone, day: 'numeric' });

  if (!end || isNaN(end.getTime()) || endIso === startIso) {
    return `${startMonth} ${startDay}`;
  }

  const endMonth = end
    .toLocaleDateString('en-US', { timeZone: timezone, month: 'short' })
    .toUpperCase();
  const endDay = end.toLocaleDateString('en-US', { timeZone: timezone, day: 'numeric' });

  if (startMonth === endMonth) {
    return `${startMonth} ${startDay}–${endDay}`;
  }
  return `${startMonth} ${startDay} – ${endMonth} ${endDay}`;
}
