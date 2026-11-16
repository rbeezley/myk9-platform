/**
 * Maps rows of `show_dogs_limited_view` (MYK9-1517) onto the staff dog finder's
 * `StaffDog` shape so the exhibitor view reuses one list component. The rows hold
 * only the owner-approved fields: no scores, results, contact or money.
 *
 * @module at-show/exhibitorDogIndex
 */
import { formatTrialDate } from '@myk9/core';
import { parseClaimState } from '@myk9/ringside/run-queue';
import type { StaffDog, StaffDogClassEntry } from './staffDogIndex';
import { isBeforeTrialDay } from './placeInLineDayGate';

/** One row of the server function, exactly its approved columns. */
export interface ShowDogLimitedRow {
  armband: number;
  call_name: string | null;
  breed: string | null;
  handler_name: string | null;
  class_id: string | null;
  class_name: string | null;
  trial_name: string | null;
  trial_date: string | null;
  check_in_status: string | null;
  /**
   * Place in the ringside waiting queue, counted on the server by the rule
   * get_my_entry_queue_places uses (MYK9-1578). NULL when not waiting; absent
   * before that migration is applied.
   */
  run_position?: number | null;
  /** live | paper | stale for `run_position` (MYK9-1969). Absent or unknown reads as stale. */
  run_claim_state?: string | null;
}

/** Group the per-class rows into one dog per armband (armbands are unique per show). */
export function buildExhibitorDogs(
  rows: readonly ShowDogLimitedRow[],
  now = new Date()
): StaffDog[] {
  const byArmband = new Map<number, StaffDog>();
  for (const row of rows) {
    let dog = byArmband.get(row.armband);
    if (!dog) {
      dog = {
        key: `armband:${row.armband}`,
        dogName: row.call_name ?? '',
        breed: row.breed ?? '',
        handler: row.handler_name ?? '',
        armband: row.armband,
        entries: [],
      };
      byArmband.set(row.armband, dog);
    }
    const checkInStatus = row.check_in_status ?? 'no-status';
    const entry: StaffDogClassEntry = {
      entryId: `${row.armband}:${row.class_id ?? 'none'}`,
      classId: row.class_id,
      routeClassIds: [],
      className: row.class_name ?? 'Class',
      trialLabel:
        [row.trial_name, row.trial_date ? formatTrialDate(row.trial_date) : '']
          .filter(Boolean)
          .join(' · ') || null,
      checkInStatus,
      isPulled: checkInStatus === 'pulled',
      isMoved: false,
      isScored: false,
      resultText: null,
      searchTime: null,
      faultCount: null,
      placement: null,
      resultsReleased: false,
      // MYK9-2092: no place in line before the trial day.
      runPosition: isBeforeTrialDay(row.trial_date, now) ? null : (row.run_position ?? null),
      runClaimState: parseClaimState(row.run_claim_state),
    };
    dog.entries.push(entry);
  }
  return [...byArmband.values()];
}
