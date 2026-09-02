// Deferred groundwork for the scheduled batch producer (MYK9-228). The UI does
// not expose these schedules while no producer exists (MYK9-318).
import type { LifecycleEmailStepType } from './types';

export interface ShowLifecycleScheduleInput {
  startDate: string;
  endDate?: string | null;
  timezone: string;
}

export function calculateReminderDueAt(input: {
  showStartDate: string;
  timezone: string;
  daysBefore: 1 | 14;
  localHour?: number;
}): Date {
  const showDate = parseShowCalendarDate(input.showStartDate, input.timezone);
  const reminderDate = addCalendarDays(showDate, -input.daysBefore);
  return zonedTimeToUtcDate(
    {
      ...reminderDate,
      hour: input.localHour ?? 9,
      minute: 0,
      second: 0,
      millisecond: 0,
    },
    input.timezone
  );
}

export function calculateResultsAvailableAfter(input: {
  showEndDate: string;
  timezone: string;
  localHour?: number;
}): Date {
  const showEndDate = parseShowCalendarDate(input.showEndDate, input.timezone);
  const nextLocalDate = addCalendarDays(showEndDate, 1);
  return zonedTimeToUtcDate(
    {
      ...nextLocalDate,
      hour: input.localHour ?? 9,
      minute: 0,
      second: 0,
      millisecond: 0,
    },
    input.timezone
  );
}

export function calculateLifecycleEmailDueAt(
  stepType: LifecycleEmailStepType,
  input: ShowLifecycleScheduleInput,
  now = new Date()
): Date {
  if (stepType === 'two_week_reminder') {
    return calculateReminderDueAt({
      showStartDate: input.startDate,
      timezone: input.timezone,
      daysBefore: 14,
    });
  }

  if (stepType === 'day_before_reminder') {
    return calculateReminderDueAt({
      showStartDate: input.startDate,
      timezone: input.timezone,
      daysBefore: 1,
    });
  }

  if (stepType === 'results_available') {
    return calculateResultsAvailableAfter({
      showEndDate: input.endDate ?? input.startDate,
      timezone: input.timezone,
    });
  }

  return now;
}

interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

interface ZonedDateTime extends CalendarDate {
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
}

function parseShowCalendarDate(value: string, timezone: string): CalendarDate {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    return {
      year: Number(dateOnly[1]),
      month: Number(dateOnly[2]),
      day: Number(dateOnly[3]),
    };
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid show date: ${value}`);
  }
  const parts = getZonedParts(parsed, timezone);
  return { year: parts.year, month: parts.month, day: parts.day };
}

function addCalendarDays(date: CalendarDate, days: number): CalendarDate {
  const utc = new Date(Date.UTC(date.year, date.month - 1, date.day + days, 12));
  return {
    year: utc.getUTCFullYear(),
    month: utc.getUTCMonth() + 1,
    day: utc.getUTCDate(),
  };
}

function zonedTimeToUtcDate(target: ZonedDateTime, timezone: string): Date {
  let guess = Date.UTC(
    target.year,
    target.month - 1,
    target.day,
    target.hour,
    target.minute,
    target.second,
    target.millisecond
  );

  for (let i = 0; i < 3; i += 1) {
    const actual = getZonedParts(new Date(guess), timezone);
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
      0
    );
    const targetAsUtc = Date.UTC(
      target.year,
      target.month - 1,
      target.day,
      target.hour,
      target.minute,
      target.second,
      0
    );
    const delta = targetAsUtc - actualAsUtc;
    if (delta === 0) break;
    guess += delta;
  }

  return new Date(guess + target.millisecond);
}

function getZonedParts(date: Date, timezone: string): Omit<ZonedDateTime, 'millisecond'> {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  const values = Object.fromEntries(
    formatter.formatToParts(date).map(part => [part.type, part.value])
  );

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}
