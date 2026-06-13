export type TableSyncStatus = 'idle' | 'syncing' | 'success' | 'error';

export interface TableSyncResultSummary {
  name: string;
  ok: boolean;
  error?: string | undefined;
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
      tableStatusUpdates[name] = 'success';
      if (recoveredFromEmptyReplica) {
        recoveredTables.push(name);
      }
    } else if (isAbortSyncError(error)) {
      tableStatusUpdates[name] = 'idle';
      abortedTables.push(error === undefined ? { name } : { name, error });
    } else {
      const errorMsg = error || 'Unknown error';
      downloadFailures.push({ name, error: errorMsg });
      tableStatusUpdates[name] = 'error';
    }
  }

  return { tableStatusUpdates, downloadFailures, recoveredTables, abortedTables };
}

export function getPostSyncInvalidationKeys(tableNames: readonly string[]): string[][] {
  // The judge dashboard reads a denormalized judge_assignments + classes query.
  return [...tableNames.map(name => [name]), ['judges', 'assignments']];
}

export function shouldRequestPostUploadSync(
  uploadedTables: readonly string[],
  replicatedTableNames: readonly string[],
  isSyncing: boolean
): boolean {
  if (isSyncing) return false;

  const replicated = new Set(replicatedTableNames);
  return uploadedTables.some(table => replicated.has(table));
}
