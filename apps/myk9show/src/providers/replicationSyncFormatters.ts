export interface SyncFailedEventDetail {
  count: number;
  mutations: Array<{ id: string; tableName: string; operation: string; error?: string }>;
  message: string;
}

const TABLE_LABELS: Record<string, string> = {
  shows: 'show',
  trials: 'trial',
  classes: 'class',
  entries: 'entry',
  dogs: 'dog',
  clubs: 'club',
  judge_assignments: 'judge assignment',
  armbands: 'armband',
  waitlist_entries: 'waitlist entry',
};

const OPERATION_LABELS: Record<string, string> = {
  INSERT: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
};

function objectLabel(tableName: string | undefined): string {
  if (!tableName) return 'change';
  return TABLE_LABELS[tableName] ?? 'change';
}

function actionLabel(operation: string | undefined): string {
  if (!operation) return 'save';
  return OPERATION_LABELS[operation.toUpperCase()] ?? 'save';
}

export function formatSyncFailureToast(detail: SyncFailedEventDetail): string {
  const first = detail.mutations[0];
  if (detail.count === 1 && first) {
    return `We couldn't ${actionLabel(first.operation)} this ${objectLabel(first.tableName)}. Retry or discard this change.`;
  }

  return `We couldn't save ${detail.count} changes. Retry or discard these changes.`;
}

export function formatDownloadFailureToast(
  failures: Array<{ name: string; error: string }>
): string {
  const first = failures[0];
  const label = first ? objectLabel(first.name) : 'show data';
  const remainingCount = failures.length - 1;
  const tail =
    remainingCount > 0
      ? ` ${remainingCount} more area${remainingCount === 1 ? '' : 's'} also ${
          remainingCount === 1 ? 'needs' : 'need'
        } to refresh.`
      : '';
  return `We couldn't refresh ${label} data. You can keep using the saved copy while we try again.${tail}`;
}
