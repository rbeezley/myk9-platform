import { vi } from 'vitest';

/** The replica as a desk write leaves it: rows by entry id, written the way the real writes do. */
const replicaRows = new Map<string, Record<string, unknown>>();

export function resetReplica() {
  replicaRows.clear();
}

/** Stores (or updates) the replica row for `entryId`, as a stored write would. */
export function writeReplicaRow(entryId: string, fields: Record<string, unknown>) {
  replicaRows.set(entryId, {
    id: entryId,
    classId: 'class-1',
    showId: 'show-1',
    ...replicaRows.get(entryId),
    ...fields,
  });
}

/** The mocked `replicatedEntriesTable` and `replicatedClassesTable` the stored-row read goes through. */
export const replicaEntriesTable = {
  getEntryById: vi.fn(async (entryId: string) => replicaRows.get(entryId) ?? null),
};
export const replicaClassesTable = {
  get: vi.fn(async (classId: string) => ({
    id: classId,
    name: 'Container Novice A',
    element: 'Container',
    level: 'Novice',
  })),
};
