export interface SyncFailedEventDetail {
  count: number;
  mutations: Array<{ tableName: string; operation: string; error?: string }>;
  message: string;
}

export function formatSyncFailureToast(detail: SyncFailedEventDetail): string {
  const first = detail.mutations[0];
  const detailText = first
    ? `${first.tableName} ${first.operation.toLowerCase()}${first.error ? `: ${first.error}` : ''}`
    : detail.message;
  return `Failed to save ${detail.count} change${detail.count === 1 ? '' : 's'}. ${detailText}`;
}

export function formatDownloadFailureToast(
  failures: Array<{ name: string; error: string }>
): string {
  const first = failures[0];
  const tail = failures.length > 1 ? ` (and ${failures.length - 1} more)` : '';
  const detail = first ? `${first.name}: ${first.error}` : '';
  return `Failed to load data from server. ${detail}${tail}`;
}
