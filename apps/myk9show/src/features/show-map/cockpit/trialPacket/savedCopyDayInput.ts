import { getTrialTimezone } from '@/features/registries';
import { splitPacketInputByTrialDay } from '@/features/emergency-trial-packet/emergencyTrialPacket';
import type { EmergencyPacketInput } from '@/features/emergency-trial-packet/types';
import type { DbClass, DbTrial } from '@/types/database-mappings';

import { lifecycleFor } from '../buildSecretaryCockpitSnapshot';

/** What the report mapping prints for a class nobody judges; the saved packet leaves it blank. */
const UNASSIGNED_JUDGE_LABEL = 'TBD';

/**
 * One trial day's packet input, the way the nightly job builds it (MYK9-2101): the whole show's
 * report data split by day, the day's own trials, each trial's time zone from the app's trial row,
 * and a blank judge name for a class the roster gives no judge, so it lands in the "No judge
 * assigned" packet as the server's input does. Null when the show has nothing on that day.
 */
export function buildSavedCopyDayInput(args: {
  packetData: Omit<EmergencyPacketInput, 'generatedAt'>;
  trials: readonly DbTrial[];
  /** The app's class rows, for each class's status. */
  classes: readonly DbClass[];
  trialDate: string;
  generatedAt: string;
}): EmergencyPacketInput | null {
  const { packetData, trials, classes, trialDate, generatedAt } = args;
  // The nightly input leaves out cancelled trials and classes and their entries, by the same
  // lifecycle the cockpit reads, so a cancelled class never prints an empty scoresheet.
  const cancelledTrials = new Set(
    trials.filter(trial => lifecycleFor(trial.status ?? undefined) === 'cancelled').map(t => t.id)
  );
  const cancelledClasses = new Set(
    classes
      .filter(
        item =>
          lifecycleFor(item.status ?? undefined) === 'cancelled' ||
          (item.trial_id ? cancelledTrials.has(item.trial_id) : false)
      )
      .map(item => item.id)
  );
  const live: Omit<EmergencyPacketInput, 'generatedAt'> = {
    ...packetData,
    trials: packetData.trials.filter(trial => !cancelledTrials.has(trial.id)),
    classes: packetData.classes.filter(
      item => !cancelledClasses.has(item.id) && !cancelledTrials.has(item.trialId)
    ),
    entries: packetData.entries.filter(
      entry =>
        !(entry.classId && cancelledClasses.has(entry.classId)) &&
        !(entry.trialId && cancelledTrials.has(entry.trialId))
    ),
  };
  const day = splitPacketInputByTrialDay({ ...live, generatedAt }).find(
    item => item.trialDate === trialDate
  );
  if (!day) return null;
  const rowsById = new Map(trials.map(trial => [trial.id, trial]));
  return {
    ...day.input,
    trials: day.input.trials.map(trial => ({
      ...trial,
      timezone: getTrialTimezone(rowsById.get(trial.id)),
    })),
    classes: day.input.classes.map(classItem =>
      classItem.judgeName.trim() === UNASSIGNED_JUDGE_LABEL
        ? { ...classItem, judgeName: '' }
        : classItem
    ),
  };
}
