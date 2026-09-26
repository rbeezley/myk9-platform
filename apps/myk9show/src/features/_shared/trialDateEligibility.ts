/**
 * Shared "is this trial today" predicate (MYK9-825/826).
 *
 * Show Desk's People-at-show roster (`peopleRoster.ts`'s `checkInEligibility`)
 * and its "Check in N entries" pending signal (`showDeskPendingSignals.ts`)
 * both need to know whether a class's trial date is the secretary's current
 * day before treating an entry as actionable at the gate. Two independent
 * copies of this rule previously drifted: the signal counted every
 * not-yet-checked-in entry regardless of trial date, while the roster's own
 * eligibility check (which decides whether "Check in" actually renders)
 * already excluded future trials. Both now call this one function.
 */
export function formatDateInTimezone(timezone: string | null | undefined, date: Date): string {
  const options: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(timezone ? { timeZone: timezone } : {}),
  };

  try {
    const parts = new Intl.DateTimeFormat('en-US', options).formatToParts(date);
    const year = parts.find(part => part.type === 'year')?.value;
    const month = parts.find(part => part.type === 'month')?.value;
    const day = parts.find(part => part.type === 'day')?.value;
    if (year && month && day) return `${year}-${month}-${day}`;
  } catch {
    return formatDateInTimezone(null, date);
  }

  return date.toISOString().slice(0, 10);
}

/**
 * `currentDate: null | undefined` means no "today" reference is available —
 * callers without one (e.g. a test fixture, or a caller that never wires a
 * clock) skip the date gate entirely rather than reject on it.
 */
export function isTrialDateToday(
  trialDate: string | null | undefined,
  timezone: string | null | undefined,
  currentDate: Date | null | undefined
): boolean {
  if (!currentDate) return true;
  if (!trialDate) return false;
  return trialDate === formatDateInTimezone(timezone, currentDate);
}
