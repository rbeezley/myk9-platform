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
 * A dog IN the ring now (its own check-in status, the signal the row badge
 * shows) is near the front as a fact, so it counts even with no confirmed
 * places; only place-based entries need them.
 */
import { describeNearUp, type NearUpItem } from './ringConflicts';
import type { AtShowEntryDetail } from './myAtShowEntryDetails.helpers';

export function detectPlaceRingConflicts(
  entries: readonly AtShowEntryDetail[],
  places: ReadonlyMap<string, number> | undefined,
  leadDogs: number
): ReadonlyMap<string, string> {
  const result = new Map<string, string>();
  const nearUp: NearUpItem[] = [];
  for (const detail of entries) {
    if (!detail.classId || detail.classStatus !== 'in_progress' || detail.isScored) continue;
    const place = places?.get(detail.entryId);
    const inRing = detail.checkInStatus === 'in-ring';
    if (!inRing && (place === undefined || place - 1 > leadDogs)) continue;
    nearUp.push({
      entryId: detail.entryId,
      classId: detail.classId,
      className: detail.className ?? detail.classId,
      callName: detail.dogName,
      result: inRing ? { kind: 'in-ring' } : { kind: 'waiting', dogsAhead: (place as number) - 1 },
    });
  }

  for (const item of nearUp) {
    const others = nearUp.filter(other => other.classId !== item.classId);
    if (others.length > 0) result.set(item.entryId, others.map(describeNearUp).join(' · '));
  }
  return result;
}
