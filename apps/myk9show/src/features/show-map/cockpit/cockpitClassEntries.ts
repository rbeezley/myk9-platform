import {
  placeInLine,
  compareByRunOrder,
  isInRingEntry,
  type RunQueueEntry,
} from '@myk9/ringside/run-queue';

import { resultStatusLabel } from '@/components/common/resultStatusLabel';
import {
  isAccountedFor,
  isExpectedEntry,
  isNonRunningEntry,
  isPulledEntry,
  isRunnableEntry,
  type EntryAccountingFields,
} from '@/features/_shared/entryAccounting';
import { isPendingEntryStatus } from '@/features/entry-operations/classEntryBreakdown';
import { deskStatusEditableFor } from '@/components/entries/management/checkInDesk/deskEditable';
import { deskLockedReason } from '@/components/entries/management/checkInDesk/deskStatus';
import { mapEntryStatus } from '@/services/entryDisplay/entryStatusUiAdapter';
import { mapClassEntryStatus } from '@/utils/entryManagementUtils';
import type { CheckInStatus } from '@/types/check-in-types';

import { getShowMapNodeId } from '../showMapTree';
import type { ShowMapDisplayStatus, ShowMapEntryDisplay, ShowMapTree } from '../showMapTypes';

/** Where a dog stands in its class, from the shared entry-accounting and run-queue rules. */
export type ClassEntryState = 'waiting' | 'in-ring' | 'scored' | 'pulled' | 'withdrawn' | 'absent';

/**
 * One dog in a class, as the Show Desk entries table and the schedule row's phrase read it. Which
 * dogs are listed and counted is `entryAccounting` (the same set as the class's `entryCount`), the
 * order and place in line are the `runQueue` rules. The only rules held here are display ones: which
 * non-running dogs are still listed (`isListed`) and the label each dog gets (`stateOf`). The labels
 * are this table's own (Scored, Waiting); `classifyEntryRunStatus` words them differently.
 */
export interface SecretaryCockpitClassEntry {
  nodeId: string;
  /** The run queue's view of this row: what `isInRingEntry`, `findInRingEntry` and
   * `pendingByRunOrder` read, so the tile and the table agree with Ringside. */
  queue: RunQueueEntry;
  /** The entry row's id: what the Check-in desk's status write is keyed on. */
  entryId: string;
  /** The stored check-in status, `no-status` when none is recorded. */
  checkInValue: CheckInStatus;
  /** The Check-in desk may set this class's status (`deskStatusEditableFor`). */
  deskEditable: boolean;
  /** Why a row that cannot be changed stays locked (scored, in the ring), as on the desk. */
  lockedReason: string | null;
  armband?: string | undefined;
  dogName: string;
  breed?: string | undefined;
  handler?: string | undefined;
  checkIn?: ShowMapDisplayStatus | undefined;
  state: ClassEntryState;
  /** In the expected set: counted as entered, and as scored or still to run. */
  counted: boolean;
  /** Runnable, not yet in the ring, and not checked in. */
  notCheckedIn: boolean;
  /** 1-based place in line; null once the dog is scored, in the ring, pulled or withdrawn. */
  place: number | null;
  /** The recorded result as the other screens abbreviate it (Q, NQ, ABS, ...), or null. */
  result: string | null;
}

function accountingFields(display: ShowMapEntryDisplay): EntryAccountingFields {
  return {
    entry_status: display.entryStatus,
    check_in_status: display.checkInStatus,
    is_scored: display.isScored,
    result_status: display.resultStatus,
    deleted_at: display.deletedAt ?? null,
  };
}

/** Listed in the table: the expected set, plus dogs that will not run (shown with their status). */
function isListed(fields: EntryAccountingFields, entryStatus: string | undefined): boolean {
  if (fields.deleted_at != null) return false;
  // Awaiting approval is reached only through the "N pending" link; rejected and moved never list.
  if (entryStatus && isPendingEntryStatus(entryStatus)) return false;
  return isExpectedEntry(fields) || isNonRunningEntry(fields) || isPulledEntry(fields);
}

function checkInOf(fields: EntryAccountingFields): string {
  return fields.check_in_status?.trim().toLowerCase() || 'no-status';
}

function stateOf(
  fields: EntryAccountingFields,
  entryStatus: string,
  queue: RunQueueEntry
): ClassEntryState {
  if (entryStatus === 'withdrawn') return 'withdrawn';
  if (isPulledEntry(fields)) return 'pulled';
  if (!isExpectedEntry(fields)) return 'absent';
  if (isAccountedFor(fields)) return 'scored';
  return isInRingEntry(queue) ? 'in-ring' : 'waiting';
}

/** A result shows only for a dog that ran: `pending` is the unscored default, and a pulled or
 * withdrawn dog's result was recorded before the pull (MYK9-1258). */
function recordedResult(state: ClassEntryState, resultStatus: string | undefined): string | null {
  const status = resultStatus?.trim().toLowerCase();
  if (state !== 'scored' || !status || status === 'pending') return null;
  return resultStatusLabel(status);
}

/** The run queue's view of a row; anything not runnable is folded to `pulled`, as the at-show
 * adapter does, so membership stays `isRunnableEntry` and nothing else. */
function queueRowOf(
  nodeId: string,
  display: ShowMapEntryDisplay,
  fields: EntryAccountingFields
): RunQueueEntry {
  const parsed = Number.parseInt(display.armband ?? '', 10);
  const runnable = isRunnableEntry(fields);
  const checkIn = checkInOf(fields);
  return {
    id: nodeId,
    armband: Number.isNaN(parsed) ? 0 : parsed,
    exhibitorOrder: display.runOrder ?? null,
    isScored: display.isScored ?? false,
    status: runnable ? checkIn : 'pulled',
    // Mirrors `toRunQueueEntry`: the flag or the status, and only for a runnable row (a stale
    // flag on a row nobody expects to run is not a ring state).
    inRing: runnable && (checkIn === 'in-ring' || display.isInRing === true),
  };
}

export function classEntriesForClass(
  classId: string,
  tree: ShowMapTree
): SecretaryCockpitClassEntry[] {
  const childIds = tree.childIdsByParentId[getShowMapNodeId('class', classId)] ?? [];
  const listed: {
    queue: RunQueueEntry;
    fields: EntryAccountingFields;
    entry: Omit<SecretaryCockpitClassEntry, 'place'>;
  }[] = [];
  for (const childId of childIds) {
    const node = tree.nodesById[childId];
    if (!node || node.type !== 'entry' || !node.entryDisplay) continue;
    const display = node.entryDisplay;
    const fields = accountingFields(display);
    const entryStatus = display.entryStatus?.trim().toLowerCase();
    if (!isListed(fields, entryStatus)) continue;
    const queue = queueRowOf(node.id, display, fields);
    const state = stateOf(fields, entryStatus ?? '', queue);
    const counted = isExpectedEntry(fields);
    const checkInValue = (display.checkInStatus ?? 'no-status') as CheckInStatus;
    const deskEditable = deskStatusEditableFor({
      entryStatus: mapEntryStatus(display.entryStatus),
      classStatus: mapClassEntryStatus(display.entryStatus),
      checkInStatus: checkInValue,
      isScored: display.isScored,
    });
    listed.push({
      queue,
      fields,
      entry: {
        nodeId: node.id,
        queue,
        entryId: node.id.slice(getShowMapNodeId('entry', '').length),
        checkInValue,
        deskEditable,
        lockedReason: deskLockedReason(
          { isScored: display.isScored ?? null },
          checkInValue,
          deskEditable
        ),
        armband: display.armband,
        dogName: display.dogName,
        breed: display.breed,
        handler: display.handler,
        checkIn: node.checkInStatus,
        state,
        counted,
        notCheckedIn: state === 'waiting' && counted && checkInOf(fields) === 'no-status',
        result: recordedResult(state, display.resultStatus),
      },
    });
  }
  listed.sort((a, b) => compareByRunOrder(a.queue, b.queue));
  const queue = listed.map(row => row.queue);
  return listed.map(row => ({ ...row.entry, place: placeInLine(queue, row.queue.id) }));
}

/**
 * How many of the class's entries the tree left out (its preview cap). Show Desk builds an
 * uncapped tree, so this is 0 there; it is kept so a capped tree can never look complete.
 */
export function hiddenEntryCount(classId: string, tree: ShowMapTree): number {
  const classNode = tree.nodesById[getShowMapNodeId('class', classId)];
  if (!classNode) return 0;
  const shown = (tree.childIdsByParentId[classNode.id] ?? []).filter(
    id => tree.nodesById[id]?.type === 'entry'
  ).length;
  return Math.max(0, classNode.childrenCount - shown);
}

/** The run status as the table shows it. */
export function runStatusDisplay(entry: SecretaryCockpitClassEntry): {
  label: string;
  kind: ShowMapDisplayStatus['kind'];
  /** Drawn as a dashed outline: the dog is expected but has not turned up yet. */
  outlined?: true;
} {
  switch (entry.state) {
    case 'scored':
      // A dog marked absent is done for the class (counted with the scored), but it never ran.
      return entry.result === 'ABS'
        ? { label: 'Absent', kind: 'muted' }
        : { label: 'Scored', kind: 'complete' };
    case 'in-ring':
      return { label: 'In ring', kind: 'active' };
    case 'pulled':
      return { label: 'Pulled', kind: 'muted' };
    case 'withdrawn':
      return { label: 'Withdrawn', kind: 'muted' };
    case 'absent':
      return { label: 'Absent', kind: 'muted' };
    case 'waiting':
      return entry.notCheckedIn
        ? { label: 'Not checked in', kind: 'neutral', outlined: true }
        : { label: 'Waiting', kind: 'neutral' };
  }
}

/**
 * True while the class's entries have not been read: no rows, and the class does not say it has
 * none. The tiles and table then say so, never "0 entered" or "No entries" for a class that has dogs.
 */
export function entriesUnread(
  entries: readonly SecretaryCockpitClassEntry[],
  entryCount: number | null | undefined
): boolean {
  return entries.length === 0 && entryCount !== 0;
}

export interface ClassEntryCounts {
  entered: number;
  scored: number;
  inRing: number;
  stillToRun: number;
  notCheckedIn: number;
}

/**
 * The four count tiles, and the "not checked in" the schedule phrase uses, from the same rows.
 * Entered is the expected set (the class's `entryCount`); scored, in the ring and still to run
 * partition it.
 */
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
    if (!entry.counted) continue;
    counts.entered += 1;
    if (entry.state === 'scored') counts.scored += 1;
    else if (entry.state === 'in-ring') counts.inRing += 1;
    else if (entry.state === 'waiting') counts.stillToRun += 1;
    if (entry.notCheckedIn) counts.notCheckedIn += 1;
  }
  return counts;
}
