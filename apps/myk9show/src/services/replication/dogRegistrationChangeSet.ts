/**
 * One pending change set per registration row (Codex round 5, owner-approved).
 *
 * A row has at most one queued UPDATE. Its payload is always recomputed as
 * the columns where the row's local value differs from the server base it was
 * last reconciled to (`ReplicatedRow.baseData`), plus `updated_at`: on every
 * edit, and after every reconcile against a newer server copy (a sync
 * download, an OCC re-fetch, Keep mine). An empty set drops the UPDATE, and a
 * row with nothing else queued goes back to the server's copy, clean. The
 * package never rebases this table's queued UPDATE (it has no
 * `rebuildUpdatePayload`), so its OCC token only moves together with a
 * recomputed payload. A column both sides changed differently is caught by the
 * package's conflict check before any reconcile, and surfaces.
 *
 * Replacing the UPDATE: the queue cannot rewrite a payload in place, so the
 * row's pending UPDATE is discarded (`discardPendingMutationsForRow` with an
 * operation filter, leaving a queued INSERT alone) and a new one is queued with
 * the row's current dependencies.
 */
import type { MutationManager, ReplicatedRow } from '@myk9/replication';
import type { ReplicatedDogRegistration } from './dogRegistrationRows';
import { registrationChangePayload } from './dogRegistrationRows';
import { applyRegistrationChanges, registrationChanges } from './dogRegistrationWrites';
import { queuedWorkBefore } from './dogRegistrationWriteSupport';

type Row = ReplicatedRow<ReplicatedDogRegistration>;

/** The parts of the registrations table an edit or a recompute uses. */
export interface ChangeSetTable {
  getTableName(): string;
  getReplicatedRow(id: string): Promise<Row | null>;
  getPendingMutationIdsForRow(rowId: string): Promise<string[]>;
  set(
    id: string,
    data: ReplicatedDogRegistration,
    isDirty: boolean,
    expectedVersion?: number
  ): Promise<unknown>;
  replaceFromRemote(
    id: string,
    data: ReplicatedDogRegistration,
    remoteServerVersion?: number
  ): Promise<void>;
}

export interface ChangeSetContext {
  table: ChangeSetTable;
  queue: MutationManager | null;
  /** Queue the row's UPDATE (the table's protected `queueMutation`). */
  queueUpdate(id: string, payload: Record<string, unknown>, dependsOn?: string[]): Promise<unknown>;
}

/** The editable columns of a row, in column names. */
function columnsOf(row: ReplicatedDogRegistration): Record<string, unknown> {
  return {
    organization: row.organization,
    registration_number: row.registrationNumber,
    registered_name: row.registeredName ?? null,
    breed: row.breed ?? null,
    variety: row.variety ?? null,
    status: row.status ?? null,
    registration_date: row.registrationDate ?? null,
  };
}

/** The columns where `data` differs from the server `base`. */
export function changeSetAgainst(
  base: ReplicatedDogRegistration,
  data: ReplicatedDogRegistration
): Record<string, unknown> {
  return registrationChanges(base, columnsOf(data));
}

/** The server copy a row's local value is measured against. */
const serverBase = (row: Row) => (row.isDirty && row.baseData ? row.baseData : row.data);

/**
 * Back to the server base, clean: the row's edits cancelled out. A device-only
 * add keeps its flags (its INSERT is still queued).
 */
async function restoreServerBase(table: ChangeSetTable, row: Row): Promise<void> {
  const base = serverBase(row);
  const data =
    row.data._localOnly === true
      ? { ...base, _localOnly: true, ...(row.data._queuedAdd ? { _queuedAdd: true } : {}) }
      : base;
  await table.replaceFromRemote(row.id, data, row.serverVersion);
}

async function replaceUpdate(
  ctx: ChangeSetContext,
  row: Row,
  changeSet: Record<string, unknown>
): Promise<void> {
  const dependsOn = await queuedWorkBefore(ctx.table, row.data);
  await ctx.queueUpdate(
    row.id,
    registrationChangePayload(changeSet),
    dependsOn.length > 0 ? dependsOn : undefined
  );
}

/**
 * Apply an edit's changed columns to the row as it is now, and recompute the
 * row's one pending UPDATE. Returns the row's resulting data.
 */
export async function applyRegistrationEdit(
  ctx: ChangeSetContext,
  id: string,
  changes: Readonly<Record<string, unknown>>
): Promise<ReplicatedDogRegistration> {
  for (let attempt = 0; ; attempt++) {
    const current = await ctx.table.getReplicatedRow(id);
    if (!current) throw new Error(`Registration ${id} is no longer on this device`);
    const next = applyRegistrationChanges(current.data, changes);
    const changeSet = changeSetAgainst(serverBase(current), next);
    await ctx.queue?.discardPendingMutationsForRow(ctx.table.getTableName(), id, 'UPDATE');
    if (Object.keys(changeSet).length === 0) {
      if (current.isDirty) await restoreServerBase(ctx.table, current);
      return serverBase(current);
    }
    try {
      // Stored only if nothing changed the row since it was read.
      await ctx.table.set(id, next, true, current.version);
    } catch (error) {
      if (attempt >= 4 || !/Concurrent modification/.test(String(error))) throw error;
      continue;
    }
    await replaceUpdate(ctx, { ...current, data: next }, changeSet);
    return next;
  }
}

/**
 * After a reconcile moved the row's base (and token): recompute its pending
 * UPDATE against the merged row. Nothing to do when no UPDATE is queued.
 */
export async function recomputePendingUpdate(ctx: ChangeSetContext, id: string): Promise<void> {
  if (!ctx.queue) return;
  const row = await ctx.table.getReplicatedRow(id);
  if (!row?.isDirty || row.data._pendingDelete === true) return;
  const queued = await ctx.queue.getPendingMutationsForRow(ctx.table.getTableName(), id);
  if (!queued.some(m => m.operation === 'UPDATE')) return;
  const changeSet = changeSetAgainst(serverBase(row), row.data);
  await ctx.queue.discardPendingMutationsForRow(ctx.table.getTableName(), id, 'UPDATE');
  if (Object.keys(changeSet).length > 0) {
    await replaceUpdate(ctx, row, changeSet);
  } else if (!queued.some(m => m.operation !== 'UPDATE')) {
    await restoreServerBase(ctx.table, row);
  }
}
