import {
  getEntryStatusKind,
  isActiveSubmittedEntryStatus,
} from '@/services/entryDisplay/entryDisplaySelectors';

export type SubmittedEntryReadState = 'loading' | 'ready' | 'error';

export interface SubmittedEntryProjectionRow {
  id: string;
  dogId: string;
  classId: string;
  status: string | null;
  checkInStatus: string | null;
  deletedAt: string | null;
  specialRequests: string | null;
  handlerId: string | null;
}

export interface SubmittedEntryDbRow extends Record<string, unknown> {
  id?: unknown;
  dog_id?: unknown;
  class_id?: unknown;
  entry_status?: unknown;
  check_in_status?: unknown;
  deleted_at?: unknown;
  special_requests?: unknown;
  handler_id?: unknown;
}

export interface SubmittedEntryProjection {
  state: SubmittedEntryReadState;
  isReady: boolean;
  ownedHistory: SubmittedEntryProjectionRow[];
  activeEntries: SubmittedEntryProjectionRow[];
  activeClassIds: Set<string>;
  historyCount: number;
  hasActiveEntries: boolean;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function toSubmittedEntryProjectionRow(
  row: SubmittedEntryDbRow
): SubmittedEntryProjectionRow | null {
  const id = nullableString(row.id);
  const dogId = nullableString(row.dog_id);
  const classId = nullableString(row.class_id);
  if (!id || !dogId || !classId) return null;

  return {
    id,
    dogId,
    classId,
    status: nullableString(row.entry_status),
    checkInStatus: nullableString(row.check_in_status),
    deletedAt: nullableString(row.deleted_at),
    specialRequests: nullableString(row.special_requests),
    handlerId: nullableString(row.handler_id),
  };
}

function isActiveSubmittedEntry(row: SubmittedEntryProjectionRow): boolean {
  return isActiveSubmittedEntryStatus(row.status, row.checkInStatus);
}

export function buildSubmittedEntryProjection({
  rows,
  ownedDogIds,
  personId,
  state,
}: {
  rows: readonly SubmittedEntryProjectionRow[];
  ownedDogIds: ReadonlySet<string>;
  personId?: string | null;
  state: SubmittedEntryReadState;
}): SubmittedEntryProjection {
  const eligibleRows: SubmittedEntryProjectionRow[] = [];
  const dogsWithSurvivingRows = new Set<string>();

  for (const row of rows) {
    const isOwnedDog = ownedDogIds.has(row.dogId);
    const isAssignedHandler = personId != null && row.handlerId === personId;
    if (row.deletedAt || (!isOwnedDog && !isAssignedHandler)) continue;
    eligibleRows.push(row);
    if (getEntryStatusKind(row.status) !== 'moved') {
      dogsWithSurvivingRows.add(row.dogId);
    }
  }

  const ownedHistory: SubmittedEntryProjectionRow[] = [];
  const activeEntries: SubmittedEntryProjectionRow[] = [];
  const activeClassIds = new Set<string>();

  for (const row of eligibleRows) {
    const isSupersededMoveSource =
      getEntryStatusKind(row.status) === 'moved' && dogsWithSurvivingRows.has(row.dogId);
    if (isSupersededMoveSource) continue;

    ownedHistory.push(row);
    if (isActiveSubmittedEntry(row)) {
      activeEntries.push(row);
      activeClassIds.add(row.classId);
    }
  }

  return {
    state,
    isReady: state === 'ready',
    ownedHistory,
    activeEntries,
    activeClassIds,
    historyCount: ownedHistory.length,
    hasActiveEntries: activeEntries.length > 0,
  };
}
