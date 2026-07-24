import type { PendingMutation } from '@myk9/replication';

export interface SyncFailedEventDetail {
  count: number;
  mutations: Array<
    Pick<PendingMutation, 'id' | 'tableName' | 'operation' | 'error' | 'failureKind' | 'rpc'>
  >;
  message: string;
}

const NON_SCORING_RINGSIDE_FIELDS = new Set([
  'run_order',
  'check_in_status',
  'is_in_ring',
  'ring_entry_time',
  'ring_exit_time',
]);

function isPermanentScoreAuthorizationMutation(
  mutation: SyncFailedEventDetail['mutations'][number]
): boolean {
  if (
    mutation.failureKind !== 'authorization' ||
    mutation.tableName !== 'entries' ||
    mutation.rpc?.name !== 'ringside_update_entry'
  ) {
    return false;
  }

  return Object.keys(mutation.rpc.fields ?? {}).some(
    field => !NON_SCORING_RINGSIDE_FIELDS.has(field)
  );
}

export function hasPermanentScoreAuthorizationFailure(detail: SyncFailedEventDetail): boolean {
  return detail.mutations.some(isPermanentScoreAuthorizationMutation);
}

export function splitPermanentScoreAuthorizationFailures(
  detail: SyncFailedEventDetail
): SyncFailedEventDetail[] {
  const authorizationScoreMutations = detail.mutations.filter(
    isPermanentScoreAuthorizationMutation
  );
  if (
    authorizationScoreMutations.length === 0 ||
    authorizationScoreMutations.length === detail.mutations.length
  ) {
    return [detail];
  }

  const otherMutations = detail.mutations.filter(
    mutation => !isPermanentScoreAuthorizationMutation(mutation)
  );
  return [
    {
      ...detail,
      count: authorizationScoreMutations.length,
      mutations: authorizationScoreMutations,
    },
    {
      ...detail,
      count: otherMutations.length,
      mutations: otherMutations,
    },
  ];
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
  if (hasPermanentScoreAuthorizationFailure(detail)) {
    return "Score not saved — you're not authorized to score this class. Get a judge passcode or ask the secretary to fix access, then retry.";
  }

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
