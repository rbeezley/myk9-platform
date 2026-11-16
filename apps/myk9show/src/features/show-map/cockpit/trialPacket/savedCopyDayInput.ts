import { getTrialTimezone } from '@/features/registries';
import { splitPacketInputByTrialDay } from '@/features/emergency-trial-packet/emergencyTrialPacket';
import type { EmergencyPacketInput } from '@/features/emergency-trial-packet/types';
import type { DbTrial } from '@/types/database-mappings';

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
  trialDate: string;
  generatedAt: string;
}): EmergencyPacketInput | null {
  const { packetData, trials, trialDate, generatedAt } = args;
  const day = splitPacketInputByTrialDay({ ...packetData, generatedAt }).find(
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
