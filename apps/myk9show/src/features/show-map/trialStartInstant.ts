import { getTrialTimezone } from '@/features/registries';
import { clockTimeToInstant, scheduledClockValue } from './cockpit/cockpitTime';

/** The trial facts a start time is read from: its day, its planned start and its time zone. */
export interface StartableTrial {
  id?: string | null | undefined;
  trialDate?: string | null | undefined;
  plannedStartTime?: string | null | undefined;
  timezone?: string | null | undefined;
}

/**
 * The instant a trial starts: its planned clock time on its day, in the trial's own time zone
 * (MYK9-2122). Null when the trial has no day or no planned start, so callers say nothing
 * rather than guess. Shared by the Show Desk pill and the class change line and sheet.
 */
export function trialStartInstant(trial: StartableTrial | null | undefined): Date | null {
  const date = trial?.trialDate?.slice(0, 10);
  const clock = scheduledClockValue(trial?.plannedStartTime ?? null);
  if (!trial || !date || !clock) return null;
  try {
    const start = new Date(clockTimeToInstant(date, clock, getTrialTimezone(trial)));
    return Number.isNaN(start.getTime()) ? null : start;
  } catch {
    return null;
  }
}

/** A raw `trials` row (snake_case, as the list reads it) as a startable trial. */
export function startableTrialFromRow(row: Record<string, unknown>): StartableTrial & {
  id: string;
} {
  const text = (value: unknown) => (typeof value === 'string' ? value : null);
  return {
    id: String(row.id),
    trialDate: text(row.date),
    plannedStartTime: text(row.planned_start_time),
    timezone: text(row.timezone),
  };
}
