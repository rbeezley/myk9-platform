/**
 * Ring-conflict detection for the signed-in exhibitor's at-show entry lists.
 *
 * A conflict = two or more of MY entries near the front simultaneously in
 * DIFFERENT in-progress classes (covers both one-dog-two-classes and the
 * common one-handler-multiple-dogs case). "Near the front" = in the ring, or
 * within `leadDogs` (the existing notification preference) of going in.
 *
 * Queue positions reuse ringside's `computeDogsAheadInList` so the conflict
 * threshold and the visible "N dogs ahead" pill can never disagree.
 *
 * Deliberately separate from `useNotificationMonitor`'s `detectConflicts`:
 * that computes per-dog at alert time over realtime payloads; this computes
 * per-account at render time over replicated rows (offline-safe). Informational
 * only — marking `check_in_status='conflict'` stays a human action.
 */

import { computeDogsAheadInList, type Entry, type DogsAheadResult } from '@myk9/ringside';

/** Minimal structural slice of a ReplicatedEntry the detector reads. */
export interface RingConflictEntry {
  id: string;
  classId?: string | undefined;
  armband?: string | undefined;
  runOrder?: number | undefined;
  isScored?: boolean | undefined;
  checkInStatus?: string | undefined;
  dogCallName?: string | undefined;
}

/** Minimal structural slice of a class the detector reads. */
export interface RingConflictClass {
  classId: string;
  className: string;
  inProgress: boolean;
}

export interface DetectMyRingConflictsInput {
  entries: RingConflictEntry[];
  classes: RingConflictClass[];
  ownEntryIds: ReadonlySet<string>;
  /** Near-up threshold, from `notificationStore.preferences.leadDogs` (1–5). */
  leadDogs: number;
}

/** Map a replicated row onto the fields ringside's queue util reads. */
function toQueueEntry(entry: RingConflictEntry): Entry {
  return {
    id: entry.id,
    armband: Number(entry.armband) || 0,
    exhibitorOrder: entry.runOrder,
    isScored: entry.isScored ?? false,
    status: entry.checkInStatus,
    inRing: entry.checkInStatus === 'in-ring',
  } as unknown as Entry;
}

interface NearUpItem {
  entryId: string;
  classId: string;
  className: string;
  callName: string;
  result: DogsAheadResult;
}

function describe(item: NearUpItem): string {
  if (item.result?.kind === 'in-ring') return `${item.callName} in the ring in ${item.className}`;
  if (item.result?.kind === 'waiting' && item.result.dogsAhead === 0) {
    return `${item.callName} next in ${item.className}`;
  }
  const n = item.result?.kind === 'waiting' ? item.result.dogsAhead : 0;
  return `${item.callName} ${n} away in ${item.className}`;
}

/**
 * Returns entryId → conflict label ("Sparky next in Barn Hunt Open") for every
 * own entry involved in a conflict. Both (all) sides get an annotation, each
 * describing the OTHER class(es). Empty map = no conflicts.
 */
export function detectMyRingConflicts(
  input: DetectMyRingConflictsInput
): ReadonlyMap<string, string> {
  const { entries, classes, ownEntryIds, leadDogs } = input;
  const result = new Map<string, string>();
  if (ownEntryIds.size === 0) return result;

  const inProgress = new Map(
    classes.filter(cls => cls.inProgress).map(cls => [cls.classId, cls.className])
  );
  if (inProgress.size < 2) return result;

  const entriesByClass = new Map<string, RingConflictEntry[]>();
  for (const entry of entries) {
    if (!entry.classId || !inProgress.has(entry.classId)) continue;
    const bucket = entriesByClass.get(entry.classId);
    if (bucket) bucket.push(entry);
    else entriesByClass.set(entry.classId, [entry]);
  }

  const nearUp: NearUpItem[] = [];
  for (const [classId, classEntries] of entriesByClass) {
    const queueEntries = classEntries.map(toQueueEntry);
    for (const entry of classEntries) {
      if (!ownEntryIds.has(entry.id)) continue;
      const position = computeDogsAheadInList(queueEntries, entry.id);
      const isNearUp =
        position?.kind === 'in-ring' ||
        (position?.kind === 'waiting' && position.dogsAhead <= leadDogs);
      if (!isNearUp) continue;
      nearUp.push({
        entryId: entry.id,
        classId,
        className: inProgress.get(classId) ?? classId,
        callName: entry.dogCallName ?? 'Your dog',
        result: position,
      });
    }
  }

  const involvedClasses = new Set(nearUp.map(item => item.classId));
  if (involvedClasses.size < 2) return result;

  for (const item of nearUp) {
    const others = nearUp.filter(other => other.classId !== item.classId);
    if (others.length === 0) continue;
    result.set(item.entryId, others.map(describe).join(' · '));
  }
  return result;
}
