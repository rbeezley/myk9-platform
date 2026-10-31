/**
 * Maps rows of `show_dogs_limited_view` (MYK9-1517) onto the staff dog finder's
 * `StaffDog` shape so the exhibitor view reuses one list component. The rows hold
 * only the owner-approved fields: no scores, results, contact or money.
 *
 * @module at-show/exhibitorDogIndex
 */
import type { StaffDog, StaffDogClassEntry } from './staffDogIndex';

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
  run_order: number | null;
  check_in_status: string | null;
}

/** Group the per-class rows into one dog per armband (armbands are unique per show). */
export function buildExhibitorDogs(rows: readonly ShowDogLimitedRow[]): StaffDog[] {
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
      trialLabel: row.trial_name,
      checkInStatus,
      isPulled: checkInStatus === 'pulled',
      isMoved: false,
      isScored: false,
      resultText: null,
      searchTime: null,
      faultCount: null,
      placement: null,
      resultsReleased: false,
      runOrder: row.run_order,
    };
    dog.entries.push(entry);
  }
  return [...byArmband.values()];
}
