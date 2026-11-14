/**
 * Ringside capability adapter: binds ringside's `updateClassStatus` to
 * myK9Show's own `replicatedClassesTable.updateClass`. The builder is a pure
 * factory; hosts memoize the result.
 */

import { type RingsideReplication } from '@myk9/ringside';
import { replicatedClassesTable, replicatedTrialsTable } from '@/services/replication';
import { getTrialTimezone } from '@/features/registries';
import { clockTimeToInstant } from '@/features/show-map/cockpit/cockpitTime';
import { toShowClassStatusWrite } from './ringsideClassStatusMap';

/**
 * Replication capability — binds ringside's `updateClassStatus` to
 * myK9Show's `updateClass`.
 *
 * INTENT (owner decision 2026-10-29, MYK9-1513): ringside's eight statuses map
 * to a class status plus a ring phase (`toShowClassStatusWrite`), and nothing is
 * dropped. Briefing's time and Break's "until" time are the phase time; Start
 * Time is the class's Expected start (`revisedExpectedStart`), an instant built
 * from the entered clock time in the trial's timezone. A phase and its time are
 * written on every status change, so picking another status clears them. No
 * Status also clears the Expected start, which is what makes a class read as
 * having no status again. The write rides the class replica, so it queues offline.
 */
export function buildRingsideReplication(): RingsideReplication {
  return {
    updateClassStatus: async (classId, status, additionalFields) => {
      const { classStatus, ringPhase } = toShowClassStatusWrite(status);
      const ringPhaseTime =
        status === 'briefing'
          ? additionalFields?.briefing_time
          : status === 'break'
            ? additionalFields?.break_until
            : undefined;
      await replicatedClassesTable.updateClass(classId, {
        classStatus,
        ringPhase,
        ringPhaseTime: ringPhaseTime ? toTimeOfDay(ringPhaseTime) : null,
        ...(status === 'start_time'
          ? {
              revisedExpectedStart: await expectedStartInstant(
                classId,
                additionalFields?.start_time
              ),
            }
          : status === 'no-status'
            ? { revisedExpectedStart: null }
            : {}),
      });
    },
  };
}

/** "HH:MM" from a time input → the "HH:MM:SS" the `time` column stores. */
function toTimeOfDay(value: string): string {
  return /^\d{2}:\d{2}$/.test(value) ? `${value}:00` : value;
}

/** The clock time entered for Start Time, as the instant on the class's trial date. */
async function expectedStartInstant(
  classId: string,
  clockTime: string | undefined
): Promise<string> {
  if (!clockTime) throw new Error('Start Time needs a time');
  const cls = await replicatedClassesTable.get(classId);
  const trial = cls?.trialId ? await replicatedTrialsTable.get(cls.trialId) : null;
  const trialDate = trial?.date ?? trial?.trial_date;
  if (!trialDate) throw new Error('Cannot set a start time: the class has no trial date');
  return clockTimeToInstant(trialDate, clockTime.slice(0, 5), getTrialTimezone(trial));
}
