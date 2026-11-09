import { getStartDelayMinutes, scheduledClockValue } from './cockpitTime';
import type { SecretaryCockpitClass } from './secretaryCockpitTypes';

/**
 * What the class header's "Announce a delay" item needs: the minutes the class runs behind (null
 * when unknown) and whether the item is offered at all. Offered only before the class starts.
 */
export function focusedClassDelay({
  sourceClass,
  trialDate,
  timeZone,
}: {
  sourceClass: Pick<SecretaryCockpitClass, 'scheduledStart' | 'revisedExpectedStart' | 'lifecycle'>;
  trialDate: string;
  timeZone: string;
}): { delayMinutes: number | null; offerDelay: boolean } {
  const delayMinutes = getStartDelayMinutes({
    scheduledStart: sourceClass.scheduledStart ?? null,
    revisedExpectedStart: sourceClass.revisedExpectedStart ?? null,
    trialDate,
    timeZone,
  });
  // With no scheduled start to compare against, a revised start still means
  // "running late"; the script opens with editable default minutes.
  const late =
    delayMinutes !== null ||
    (Boolean(sourceClass.revisedExpectedStart) &&
      !scheduledClockValue(sourceClass.scheduledStart ?? null));
  return { delayMinutes, offerDelay: sourceClass.lifecycle === 'not-started' && late };
}
