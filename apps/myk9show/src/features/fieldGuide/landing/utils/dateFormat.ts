import { formatShowDate, resolveDisplayDate } from '@/features/_shared/landing/calendarDate';
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
    // A show date names a calendar DAY (stored as midnight-UTC timestamptz).
    // Converting it through a timezone rolls it back a day west of UTC; only a
    // genuine instant gets the zone applied. See _shared/landing/calendarDate.
    const { date, isCalendarDay } = resolveDisplayDate(iso);
    if (isNaN(date.getTime())) return '';
    const opts: Intl.DateTimeFormatOptions = isCalendarDay ? {} : { timeZone: timezone };
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
      // A calendar date has no time-of-day. Without this the resolver's
      // local-midnight Date renders "12:00 AM" labelled with the VIEWER's zone
      // -- a fabricated deadline that also contradicts the countdown beside it.
      // heritage and monogram already guarded this; these five did not.
      if (isCalendarDay) return '';
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
        // A calendar day has no zone to convert through; only a real instant does.
        ...(isCalendarDay ? {} : { timeZone: timezone }),
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
  // formatShowDate applies the timezone only to real instants; these columns
  // arrive as midnight UTC and must render as the day they name.
  const startMonth = formatShowDate(startIso, timezone, { month: 'short' }).toUpperCase();
  const startDay = formatShowDate(startIso, timezone, { day: 'numeric' });
  if (!startMonth) return '';

  const end = endIso ? new Date(endIso) : null;

  if (!end || isNaN(end.getTime()) || endIso === startIso) {
    return `${startMonth} ${startDay}`;
  }

  const endMonth = formatShowDate(endIso, timezone, { month: 'short' }).toUpperCase();
  const endDay = formatShowDate(endIso, timezone, { day: 'numeric' });

  if (startMonth === endMonth) {
    return `${startMonth} ${startDay}–${endDay}`;
  }
  return `${startMonth} ${startDay} – ${endMonth} ${endDay}`;
}
