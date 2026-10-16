import type { PendingMutation } from '@myk9/replication';
import { PUBLISH_GATE_MESSAGES } from '@/features/payments/onlineEntryGate';

export interface SyncFailedEventDetail {
  count: number;
  mutations: Array<
    Pick<PendingMutation, 'id' | 'tableName' | 'operation' | 'error' | 'failureKind' | 'rpc'>
  >;
  message: string;
}

export const DOWNLOAD_SYNC_FAILURE_TOAST_ID = 'replication-download-failed';

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
  // MYK9-716 / MYK9-979: a publish-gate refusal (a public show clearing its
  // entry window, a show edit-panel status change that would make it public,
  // turning online entries on without Stripe payouts) is the whole answer;
  // say it instead of the generic line. Retrying cannot succeed.
  const gateMessage = PUBLISH_GATE_MESSAGES.find(message => first?.error?.includes(message));
  if (detail.count === 1 && gateMessage) {
    return `We couldn't save this show change. ${gateMessage}`;
  }
  if (detail.count === 1 && first) {
    return `We couldn't ${actionLabel(first.operation)} this ${objectLabel(first.tableName)}. Retry or discard this change.`;
  }

  return `We couldn't save ${detail.count} changes. Retry or discard these changes.`;
}

const REASON_MAX_LENGTH = 160;
const NO_DETAIL_REASON = 'the server gave no details.';
const PERMISSION_ERROR_PATTERN =
  /row-level security|rls policy blocked|permission denied|\b42501\b/i;
/** What the queue prepends when it stores a failure (mutation-retry.ts); not the reason. */
const QUEUE_PREFIX_PATTERN = /^(?:non-retryable error|max retries exceeded):\s*/i;

/**
 * The server's reason for a refused write, shown under the failure toast so a
 * secretary (and whoever she calls) can see WHY Retry keeps failing. The
 * headline from `formatSyncFailureToast` stays plain English; this is the
 * detail line. Permission refusals are translated, anything else is the
 * refusal's own message (the server's, or a client timeout), trimmed.
 */
export function formatSyncFailureReason(detail: SyncFailedEventDetail): string | undefined {
  const first = detail.mutations.find(mutation => mutation.error?.trim());
  const error = first?.error?.trim().replace(QUEUE_PREFIX_PATTERN, '');
  if (!first || !error) return undefined;
  // Rows stored before MYK9-1146 may hold "[object Object]"; never show it.
  if (error.includes('[object Object]')) return `Reason: ${NO_DETAIL_REASON}`;
  if (PERMISSION_ERROR_PATTERN.test(error)) {
    return `You don't have permission to change this ${objectLabel(first.tableName)}.`;
  }
  const clipped =
    error.length > REASON_MAX_LENGTH ? `${error.slice(0, REASON_MAX_LENGTH - 1)}…` : error;
  return `Reason: ${clipped}`;
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
