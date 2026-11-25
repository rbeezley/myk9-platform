import {
  placeInLine,
  compareByRunOrder,
  findInRingEntry,
  isInRingEntry,
  pendingByRunOrder,
  type RunQueueEntry,
} from '@myk9/ringside/run-queue';

import { NEXT_UP_PREVIEW_LIMIT } from '@/features/at-show/atShowNextUpPreview';
import { resultStatusLabel } from '@/components/common/resultStatusLabel';
import {
  isAccountedFor,
  isExpectedEntry,
  isNonRunningEntry,
  isPulledEntry,
  isRunnableEntry,
  type EntryAccountingFields,
} from '@/features/_shared/entryAccounting';
import {
  formatStoredRunTime,
  isRanResultStatus,
  storedPlacement,
} from '@/features/_shared/runResultFacts';
import { isHeldEntry } from '@/features/dogs/identity';
import { isPendingEntryStatus } from '@/features/entry-operations/classEntryBreakdown';
import { deskStatusEditableFor } from '@/components/entries/management/checkInDesk/deskEditable';
import { deskLockedReason } from '@/components/entries/management/checkInDesk/deskStatus';
import { mapEntryStatus } from '@/services/entryDisplay/entryStatusUiAdapter';
import { mapClassEntryStatus } from '@/utils/entryManagementUtils';
import type { CheckInStatus } from '@/types/check-in-types';

import { getShowMapNodeId } from '../showMapTree';
import type { ShowMapDisplayStatus, ShowMapEntryDisplay, ShowMapTree } from '../showMapTypes';

/** Where a dog stands in its class, from the shared entry-accounting and run-queue rules. */
export type ClassEntryState =
  'waiting' | 'in-ring' | 'scored' | 'pulled' | 'withdrawn' | 'absent' | 'pending';

/** The stored run facts of a scored dog, formatted by the run sheet's helpers. */
export interface ClassEntryRunFacts {
  /** Faults and times mean something only for a dog that ran (Q or NQ). */
  ran: boolean;
  faults: number;
  timeStr: string;
  /** Empty when the class has no element time. */
  elementTimeStr: string;
  /** The server-calculated placement, or null while the class is not fully scored. */
  placement: number | null;
}

/**
 * One dog in a class, as the Show Desk entries table and the schedule card read it. Which
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
  /** `/dogs/:id` and `/people/:id` for the entry's dog and handler; absent when the id is unknown. */
  dogHref?: string | undefined;
  handlerHref?: string | undefined;
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
  /** The scored dog's time, faults, element time and placement; null for any other dog. */
  runFacts?: ClassEntryRunFacts | null | undefined;
  /**
   * MYK9-2010: a dog that is pulled or withdrawn and still holds a score (the judge saved it
   * while the secretary was pulling the dog). Never written anywhere: the pair is the flag.
   * Names what happened and the score, for the secretary to keep the pull or put the dog back.
   */
  scoredAfterRemoval?: string | null | undefined;
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
function isListed(
  fields: EntryAccountingFields,
  entryStatus: string | undefined,
  awaitingRegistrationNumber: boolean | undefined
): boolean {
  if (fields.deleted_at != null) return false;
  // A dog awaiting its registration number cannot run, so it is not on the table to be checked in
  // or scored (MYK9-1162, the rule the class run sheet applied). It is not counted here either.
  if (isHeldEntry({ ...fields, awaitingRegistrationNumber })) return false;
  // MYK9-2376: an entry awaiting approval lists too, muted and labeled Pending with no run order,
  // so a secretary never wonders why a dog is missing. Rejected and moved never list.
  if (entryStatus && isPendingEntryStatus(entryStatus)) return true;
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
  if (isPendingEntryStatus(entryStatus)) return 'pending';
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

/** The run sheet's facts for a dog that is scored in this class, read from the same entry row. */
function runFactsOf(
  state: ClassEntryState,
  display: ShowMapEntryDisplay
): ClassEntryRunFacts | null {
  if (state !== 'scored') return null;
  return {
    ran: isRanResultStatus(display.resultStatus),
    faults: display.totalFaults ?? 0,
    timeStr: formatStoredRunTime(display.searchTimeSeconds),
    elementTimeStr: formatStoredRunTime(display.elementTimeSeconds),
    placement: storedPlacement(display.finalPlacement),
  };
}

/** "Scored after being pulled: Qualified" for a pulled or withdrawn dog that holds a score. */
function scoredAfterRemovalOf(state: ClassEntryState, display: ShowMapEntryDisplay): string | null {
  if (!display.isScored || (state !== 'pulled' && state !== 'withdrawn')) return null;
  const status = display.resultStatus?.trim().toLowerCase();
  const score = status && status !== 'pending' ? resultStatusLabel(status) : null;
  // Pulled: the plan's wording. Withdrawn: the fields do not say which came first.
  const what = state === 'pulled' ? 'Scored after being pulled' : 'Withdrawn, and holds a score';
  return score ? `${what}: ${score}` : what;
}

/** The run queue's view of a row; anything not runnable is folded to `pulled`, as the at-show
 * adapter does, so membership stays `isRunnableEntry` and nothing else. */
function queueRowOf(
  nodeId: string,
  display: ShowMapEntryDisplay,
  fields: EntryAccountingFields
): RunQueueEntry {
  const parsed = Number.parseInt(display.armband ?? '', 10);
  // Awaiting approval is runnable by the accounting rules but is not in the run queue (MYK9-2376).
  const runnable = isRunnableEntry(fields) && !isPendingEntryStatus(display.entryStatus);
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
    if (!isListed(fields, entryStatus, display.awaitingRegistrationNumber)) continue;
    const queue = queueRowOf(node.id, display, fields);
    const state = stateOf(fields, entryStatus ?? '', queue);
    // An entry awaiting approval is listed but never counted as entered (MYK9-2376).
    const counted = state !== 'pending' && isExpectedEntry(fields);
    const checkInValue = (display.checkInStatus ?? 'no-status') as CheckInStatus;
    const deskEditable =
      deskStatusEditableFor({
        entryStatus: mapEntryStatus(display.entryStatus),
        classStatus: mapClassEntryStatus(display.entryStatus),
        checkInStatus: checkInValue,
        isScored: display.isScored,
      }) && state !== 'pending';
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
        dogHref: display.dogHref,
        handlerHref: display.handlerHref,
        checkIn: node.checkInStatus,
        state,
        counted,
        notCheckedIn: state === 'waiting' && counted && checkInOf(fields) === 'no-status',
        result: recordedResult(state, display.resultStatus),
        runFacts: runFactsOf(state, display),
        scoredAfterRemoval: scoredAfterRemovalOf(state, display),
      },
    });
  }
  // Dogs that will not run list below the running ones, in armband order, with no place in line.
  const NOT_RUNNING_STATES: readonly ClassEntryState[] = [
    'pending',
    'withdrawn',
    'pulled',
    'absent',
  ];
  const lastGroup = (row: (typeof listed)[number]) =>
    NOT_RUNNING_STATES.includes(row.entry.state) ? 1 : 0;
  listed.sort((a, b) => lastGroup(a) - lastGroup(b) || compareByRunOrder(a.queue, b.queue));
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
    case 'pending':
      return { label: 'Pending', kind: 'muted' };
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
 * none. The In ring tile and the table then say so, never "No entries" for a class that has dogs.
 */
export function entriesUnread(
  entries: readonly SecretaryCockpitClassEntry[],
  entryCount: number | null | undefined
): boolean {
  return entries.length === 0 && entryCount !== 0;
}

/**
 * Who is in the ring and who runs next, by the shared run-queue rule Ringside reads. A row that is
 * not expected to run is folded to `pulled` in its queue entry, so no second filter is needed.
 * The In ring tile and the schedule card both read this, so they always name the same dogs.
 */
export function runQueuePreview(entries: readonly SecretaryCockpitClassEntry[]): {
  inRing: SecretaryCockpitClassEntry | undefined;
  nextUp: SecretaryCockpitClassEntry[];
} {
  const byId = new Map(entries.map(entry => [entry.queue.id, entry]));
  const queue = entries.map(entry => entry.queue);
  const inRingQueued = findInRingEntry(queue);
  return {
    inRing: inRingQueued ? byId.get(inRingQueued.id) : undefined,
    nextUp: pendingByRunOrder(queue)
      .slice(0, NEXT_UP_PREVIEW_LIMIT)
      .flatMap(queued => byId.get(queued.id) ?? []),
  };
}

export interface ClassEntryCounts {
  entered: number;
  scored: number;
  notCheckedIn: number;
}

/**
 * The counts the schedule card uses (scored over entered, not checked in), from the same rows.
 * Entered is the expected set (the class's `entryCount`).
 */
export function countClassEntries(
  entries: readonly SecretaryCockpitClassEntry[]
): ClassEntryCounts {
  const counts: ClassEntryCounts = { entered: 0, scored: 0, notCheckedIn: 0 };
  for (const entry of entries) {
    if (!entry.counted) continue;
    counts.entered += 1;
    if (entry.state === 'scored') counts.scored += 1;
    if (entry.notCheckedIn) counts.notCheckedIn += 1;
  }
  return counts;
}
