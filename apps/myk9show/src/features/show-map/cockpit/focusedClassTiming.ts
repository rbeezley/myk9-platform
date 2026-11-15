import { formatTime } from '@/lib/format/dates';
import { instantToClockTime, scheduledClockValue } from './cockpitTime';
import type { FocusedClassModel, SecretaryCockpitClass } from './secretaryCockpitTypes';

/**
 * The class's expected start as the secretary set it: the revised time when there is one, else
 * the scheduled one; '' when neither is set. The Expected start field and the compact header's
 * summary read the same value (MYK9-1989).
 */
export function expectedStartValue(
  sourceClass: Pick<SecretaryCockpitClass, 'scheduledStart' | 'revisedExpectedStart'>,
  timeZone: string
): string {
  return (
    instantToClockTime(sourceClass.revisedExpectedStart ?? null, timeZone) ||
    scheduledClockValue(sourceClass.scheduledStart ?? null)
  );
}

/** "Started 9:42 AM · Finished 11:05 AM", "Not started" or "Start not recorded". */
export function actualTimingText(
  focused: Pick<FocusedClassModel, 'actualStart' | 'actualFinish'>,
  lifecycle: SecretaryCockpitClass['lifecycle'],
  timeZone: string
): string {
  const start = focused.actualStart.value
    ? `Started ${formatTime(focused.actualStart.value, timeZone)}`
    : // A class that ran without a recorded start must not claim it never started.
      lifecycle === 'not-started'
      ? 'Not started'
      : 'Start not recorded';
  const finish = focused.actualFinish.value
    ? ` · Finished ${formatTime(focused.actualFinish.value, timeZone)}`
    : '';
  return `${start}${finish}`;
}

/**
 * The compact header's values after the status badge (MYK9-1989): the facts, the expected start
 * and the actual timing. "Not started" is left to the badge, which already says it.
 */
export function focusedClassSummaryParts({
  facts,
  expectedStart,
  timing,
}: {
  facts: readonly string[];
  expectedStart: string;
  timing: string;
}): string[] {
  return [
    ...facts,
    expectedStart ? `Expected ${expectedStart}` : 'No expected start',
    ...(timing === 'Not started' ? [] : [timing]),
  ];
}
