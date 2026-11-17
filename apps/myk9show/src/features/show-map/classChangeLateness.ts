import { CLASS_CHANGE_SOON_MINUTES } from './classChangeSoonMinutes';

export { CLASS_CHANGE_SOON_MINUTES };

/** Minutes from `asked` to `start` (negative once the trial has started); null when unknown. */
export function minutesBeforeStart(
  asked: string | Date | null | undefined,
  start: Date | null
): number | null {
  if (!asked || !start) return null;
  const at = asked instanceof Date ? asked : new Date(asked);
  if (Number.isNaN(at.getTime())) return null;
  return (start.getTime() - at.getTime()) / 60_000;
}

/** AKC: a class change is asked at least 30 minutes before the trial starts. */
export function isLateClassChange(minutes: number | null): boolean {
  return minutes !== null && minutes < CLASS_CHANGE_SOON_MINUTES;
}

const minuteWord = (count: number) => `${count} ${count === 1 ? 'minute' : 'minutes'}`;

/** "asked 12 minutes before start" for a late request; null when it was not late. */
export function lateRequestNote(minutes: number | null): string | null {
  if (minutes === null || !isLateClassChange(minutes)) return null;
  if (minutes < 0) return `asked ${minuteWord(Math.max(1, Math.floor(-minutes)))} after start`;
  if (minutes < 1) return 'asked less than a minute before start';
  return `asked ${minuteWord(Math.floor(minutes))} before start`;
}

/** "4 of 12 entered", or "4 entered" when the class has no limit; null when the count is unknown. */
export function enteredNote(
  accepted: number | null | undefined,
  limit: number | null | undefined
): string | null {
  if (accepted === null || accepted === undefined) return null;
  return limit ? `${accepted} of ${limit} entered` : `${accepted} entered`;
}
