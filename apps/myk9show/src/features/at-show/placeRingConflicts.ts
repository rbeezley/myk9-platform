/**
 * Ring-conflict notice for "Your dogs today", driven by the SERVER place in
 * line (`get_my_entry_queue_places`) rather than by the account's own rows.
 *
 * An exhibitor-only account holds only its own entries, so counting dogs ahead
 * locally (`detectMyRingConflicts`) would call a dog with 30 ahead "next". The
 * same place the row shows decides here, so the two can never contradict.
 *
 * A conflict = two or more of MY entries, in DIFFERENT classes that are in
 * progress, each within the `leadDogs` notification preference of going in
 * (same threshold and wording as `ringConflicts`: dogsAhead = place - 1).
 * No places (offline, not loaded) means no conflicts.
 */
import { describeNearUp, type NearUpItem } from './ringConflicts';
import type { AtShowEntryDetail } from './myAtShowEntryDetails.helpers';

export function detectPlaceRingConflicts(
  entries: readonly AtShowEntryDetail[],
  places: ReadonlyMap<string, number> | undefined,
  leadDogs: number
): ReadonlyMap<string, string> {
  const result = new Map<string, string>();
  if (!places || places.size === 0) return result;

  const nearUp: NearUpItem[] = [];
  for (const detail of entries) {
    const place = places.get(detail.entryId);
    if (place === undefined || !detail.classId || detail.classStatus !== 'in_progress') continue;
    if (place - 1 > leadDogs) continue;
    nearUp.push({
      entryId: detail.entryId,
      classId: detail.classId,
      className: detail.className ?? detail.classId,
      callName: detail.dogName,
      result: { kind: 'waiting', dogsAhead: place - 1 },
    });
  }

  for (const item of nearUp) {
    const others = nearUp.filter(other => other.classId !== item.classId);
    if (others.length > 0) result.set(item.entryId, others.map(describeNearUp).join(' · '));
  }
  return result;
}
