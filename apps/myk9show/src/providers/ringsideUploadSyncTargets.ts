import type { UploadCompleteEventDetail } from '@myk9/replication';

export interface UploadSyncTarget {
  name: 'entries' | 'classes';
  scopeId: string;
}

interface LocalScopeReader {
  getEntry: (
    id: string
  ) => Promise<{ showId?: string | undefined; classId?: string | undefined } | null>;
  getClass: (id: string) => Promise<{ trialId?: string | undefined } | null>;
}

/**
 * Only the fixed ringside RPC qualifies: it cannot move an entry or change
 * enrollment. Its scoring triggers update entries/placements and class state.
 * Generic writes, mixed batches and missing local context retain full refresh.
 * Scope discovery is IDB-only; downloads still use the existing RLS-backed tables.
 */
export async function getRingsideUploadSyncTargets(
  detail: UploadCompleteEventDetail,
  local: LocalScopeReader
): Promise<UploadSyncTarget[] | null> {
  const { mutations } = detail;
  if (
    !mutations?.length ||
    mutations.length !== detail.count ||
    detail.tables.length !== 1 ||
    detail.tables[0] !== 'entries' ||
    mutations.some(
      row =>
        row.tableName !== 'entries' ||
        row.operation !== 'UPDATE' ||
        row.rpcName !== 'ringside_update_entry'
    )
  )
    return null;

  const targets = new Map<string, UploadSyncTarget>();
  try {
    for (const id of new Set(mutations.map(row => row.rowId))) {
      const entry = await local.getEntry(id);
      if (!entry?.showId || !entry.classId) return null;
      const cls = await local.getClass(entry.classId);
      if (!cls?.trialId) return null;
      targets.set(`entries:${entry.showId}`, { name: 'entries', scopeId: entry.showId });
      targets.set(`classes:${cls.trialId}`, { name: 'classes', scopeId: cls.trialId });
    }
    return [...targets.values()];
  } catch {
    return null;
  }
}
