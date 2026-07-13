const US_LONG_DATE = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

function formatUsCalendarDate(value: string | null | undefined): string {
  if (!value) return '';
  // INTENT: Show dates are calendar dates. Preserve the stored YYYY-MM-DD
  // instead of converting midnight UTC into the prior U.S. calendar day.
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T|$)/.exec(value);
  if (!match) return '';

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return '';
  }
  return US_LONG_DATE.format(date);
}

export function formatUsShowDateRange(
  startDate: string | null | undefined,
  endDate: string | null | undefined
): string {
  const start = formatUsCalendarDate(startDate);
  const end = formatUsCalendarDate(endDate);
  if (!start) return end;
  if (!end || start === end) return start;
  return `${start} — ${end}`;
}
