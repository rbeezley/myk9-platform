import { resultStatusLabel } from '@/components/common/resultStatusLabel';

import { getShowMapNodeId } from '../showMapTree';
import type { ShowMapDisplayStatus, ShowMapTree } from '../showMapTypes';

/**
 * One dog in a class, as the Show Desk entries table and the schedule row's phrase read it. Built
 * from the show map tree's entry nodes (the replicated entries the cockpit already reads), so the
 * run status is `classifyEntryRunStatus` and the check-in is `classifyEntryCheckInStatus`, never a
 * second rule. Children of a class node are already in run order (`sortEntries`).
 */
export interface SecretaryCockpitClassEntry {
  nodeId: string;
  /** 1-based place in the class's run order. */
  position: number;
  armband?: string | undefined;
  dogName: string;
  breed?: string | undefined;
  handler?: string | undefined;
  checkIn?: ShowMapDisplayStatus | undefined;
  runStatus?: ShowMapDisplayStatus | undefined;
  /** The scored result as the other screens abbreviate it (Q, NQ, ABS, ...), or null. */
  result: string | null;
}

export function classEntriesForClass(
  classId: string,
  tree: ShowMapTree
): SecretaryCockpitClassEntry[] {
  const childIds = tree.childIdsByParentId[getShowMapNodeId('class', classId)] ?? [];
  const entries: SecretaryCockpitClassEntry[] = [];
  for (const childId of childIds) {
    const node = tree.nodesById[childId];
    if (!node || node.type !== 'entry' || !node.entryDisplay) continue;
    const display = node.entryDisplay;
    entries.push({
      nodeId: node.id,
      position: entries.length + 1,
      armband: display.armband,
      dogName: display.dogName,
      breed: display.breed,
      handler: display.handler,
      checkIn: node.checkInStatus,
      runStatus: node.status,
      result: display.resultStatus ? resultStatusLabel(display.resultStatus) : null,
    });
  }
  return entries;
}

/** The run status as the table shows it: Scored, In ring, Waiting, Pulled, Moved. */
export function runStatusDisplay(entry: SecretaryCockpitClassEntry): {
  label: string;
  kind: ShowMapDisplayStatus['kind'];
} {
  const status = entry.runStatus;
  if (!status) return { label: 'Waiting', kind: 'neutral' };
  if (status.kind === 'complete') return { label: 'Scored', kind: 'complete' };
  if (status.value === 'in-ring') return { label: 'In ring', kind: 'active' };
  if (status.kind === 'muted') return { label: status.label, kind: 'muted' };
  return { label: 'Waiting', kind: 'neutral' };
}

export interface ClassEntryCounts {
  entered: number;
  scored: number;
  inRing: number;
  stillToRun: number;
  notCheckedIn: number;
}

/** The four count tiles, and the "not checked in" the schedule phrase uses, from the same rows. */
export function countClassEntries(
  entries: readonly SecretaryCockpitClassEntry[]
): ClassEntryCounts {
  const counts: ClassEntryCounts = {
    entered: 0,
    scored: 0,
    inRing: 0,
    stillToRun: 0,
    notCheckedIn: 0,
  };
  for (const entry of entries) {
    // A moved row is the retired source of a promotion; the dog is counted in its new class.
    if (entry.runStatus?.value === 'moved') continue;
    counts.entered += 1;
    const status = runStatusDisplay(entry);
    if (status.label === 'Scored') counts.scored += 1;
    else if (status.label === 'In ring') counts.inRing += 1;
    // A pulled dog is entered but will not run.
    else if (status.kind !== 'muted') {
      counts.stillToRun += 1;
      if (entry.checkIn?.value === 'no-status') counts.notCheckedIn += 1;
    }
  }
  return counts;
}
