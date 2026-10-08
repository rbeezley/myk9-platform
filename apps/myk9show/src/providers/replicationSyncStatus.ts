export type TableSyncStatus = 'idle' | 'syncing' | 'success' | 'error';

export interface TableSyncResultSummary {
  name: string;
  ok: boolean;
  error?: string | undefined;
  /** Rows the pass actually changed; identical re-delivered rows do not count. */
  rowsAffected?: number | undefined;
  recoveredFromEmptyReplica: boolean;
}

export interface ClassifiedTableSyncResults {
  tableStatusUpdates: Record<string, TableSyncStatus>;
  downloadFailures: Array<{ name: string; error: string }>;
  recoveredTables: string[];
  abortedTables: Array<{ name: string; error?: string | undefined }>;
}

export function createTablesStatus(
  tableNames: readonly string[],
  status: TableSyncStatus
): Record<string, TableSyncStatus> {
  return Object.fromEntries(tableNames.map(name => [name, status]));
}

export function classifyTableSyncResults(
  results: readonly TableSyncResultSummary[],
  isAbortSyncError: (error?: string) => boolean
): ClassifiedTableSyncResults {
  const downloadFailures: Array<{ name: string; error: string }> = [];
  const recoveredTables: string[] = [];
  const abortedTables: Array<{ name: string; error?: string }> = [];
  const tableStatusUpdates: Record<string, TableSyncStatus> = {};

  for (const { name, ok, error, recoveredFromEmptyReplica } of results) {
    if (ok) {
      tableStatusUpdates[name] ??= 'success';
      if (recoveredFromEmptyReplica) {
        recoveredTables.push(name);
      }
    } else if (isAbortSyncError(error)) {
      if (tableStatusUpdates[name] !== 'error') tableStatusUpdates[name] = 'idle';
      abortedTables.push(error === undefined ? { name } : { name, error });
    } else {
      const errorMsg = error || 'Unknown error';
      downloadFailures.push({ name, error: errorMsg });
      tableStatusUpdates[name] = 'error';
    }
  }

  return { tableStatusUpdates, downloadFailures, recoveredTables, abortedTables };
}

/**
 * Tables a pass committed rows in, even if the pass then failed (a later
 * metadata write can fail after rows landed). A pass that changed nothing
 * refetches nothing (MYK9-1054).
 */
export function getChangedTableNames(results: readonly TableSyncResultSummary[]): string[] {
  return [...new Set(results.filter(r => (r.rowsAffected ?? 0) > 0).map(r => r.name))];
}

export function getPostSyncInvalidationKeys(changedTableNames: readonly string[]): string[][] {
  if (changedTableNames.length === 0) return [];
  // The judge dashboard reads a denormalized judge_assignments + classes query.
  return [...changedTableNames.map(name => [name]), ['judges', 'assignments']];
}

export function shouldRequestPostUploadSync(
  uploadedTables: readonly string[],
  replicatedTableNames: ReadonlySet<string>,
  isSyncing: boolean
): boolean {
  if (isSyncing) return false;

  return uploadedTables.some(table => replicatedTableNames.has(table));
}
