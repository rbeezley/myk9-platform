import type { PendingMutation, UploadCompleteEventDetail } from '@myk9/replication';
import type { SyncFailedEventDetail } from '@/providers/replicationSyncFormatters';
import { logger } from '@/services/LoggingService';
import { DESK_PAYMENT_RPC, DESK_PAYMENTS_TABLE, type LocalDeskPayment } from './deskPaymentTypes';
import type { DeskPaymentsTable } from './DeskPaymentsTable';

/**
 * Fired when this device proves desk payments recorded (a replay was acknowledged, or the
 * ledger lists them): the shows whose money moved. Entry Management reloads its forms and
 * the close-out's ledger read is refreshed (MYK9-2479).
 */
export const DESK_PAYMENTS_RECORDED_EVENT = 'desk-payments:recorded';

export interface DeskPaymentsRecordedDetail {
  showIds: string[];
}

type RefreshEntries = (showId: string, enrollmentIds: readonly string[]) => Promise<void>;

/** Tell this tab the shows' money moved: whoever settled a payment announces it, once. */
export function announceDeskPaymentsRecorded(showIds: string[]): void {
  if (showIds.length === 0 || typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<DeskPaymentsRecordedDetail>(DESK_PAYMENTS_RECORDED_EVENT, {
      detail: { showIds },
    })
  );
}

/**
 * A settled payment moved its show's money: its forms' entries are read back first (each
 * entry's payment status lives in the entries replica), then the show is announced, so the
 * reload the announcement starts reads them fresh. A failed read-back still announces.
 */
export async function refreshAndAnnounceRecorded(
  recorded: ReadonlyArray<Pick<LocalDeskPayment, 'showId' | 'enrollmentId'>>,
  refreshEntries: RefreshEntries
): Promise<void> {
  const formsByShow = new Map<string, Set<string>>();
  for (const { showId, enrollmentId } of recorded) {
    formsByShow.set(showId, (formsByShow.get(showId) ?? new Set()).add(enrollmentId));
  }
  await Promise.all(
    [...formsByShow].map(([showId, forms]) =>
      Promise.resolve()
        .then(() => refreshEntries(showId, [...forms]))
        .catch(error =>
          logger.warn('Desk payment entries read-back failed', 'secretary', {}, error as Error)
        )
    )
  );
  announceDeskPaymentsRecorded([...formsByShow.keys()]);
}

/** A desk cash or check payment's queue row. */
export function isDeskPaymentMutation(
  mutation: Pick<PendingMutation, 'tableName' | 'rpc'>
): boolean {
  return mutation.tableName === DESK_PAYMENTS_TABLE && mutation.rpc?.name === DESK_PAYMENT_RPC;
}

/**
 * Desk payments are left out of the generic failure toast and its Discard, as scores
 * are: their state and actions live on their own lines beside the form's balance, and
 * a Discard there could drop money in the drawer that was in fact recorded.
 */
type FailedMutation = SyncFailedEventDetail['mutations'][number];

/**
 * A failed mutation as the failure log may carry it (shared-device plan § 3.2): a desk
 * payment keeps only its id, table, operation and failure kind. Its args, payload and the
 * server's message (which can quote the amount, date, check number or form) stay on this
 * device, on the payment's own line. Every other mutation is logged as before.
 */
export function forFailureLog(mutation: FailedMutation): Partial<FailedMutation> {
  if (!isDeskPaymentMutation(mutation)) return mutation;
  const { id, tableName, operation, failureKind } = mutation;
  return { id, tableName, operation, ...(failureKind && { failureKind }) };
}

export function withoutDeskPayments(detail: SyncFailedEventDetail): SyncFailedEventDetail {
  const mutations = detail.mutations.filter(mutation => !isDeskPaymentMutation(mutation));
  if (mutations.length === detail.mutations.length) return detail;
  return { ...detail, count: mutations.length, mutations };
}

/**
 * After an upload pass: each acknowledged desk payment is proven recorded, so its local
 * record goes and its show's money is refreshed. Resolves to the shows it refreshed.
 */
export async function settleUploadedDeskPayments(
  detail: UploadCompleteEventDetail,
  table: DeskPaymentsTable,
  refreshEntries: RefreshEntries
): Promise<string[]> {
  const ids = (detail.mutations ?? [])
    .filter(m => m.tableName === DESK_PAYMENTS_TABLE && m.rpcName === DESK_PAYMENT_RPC)
    .map(m => String(m.rowId));
  const recorded: LocalDeskPayment[] = [];
  for (const id of ids) {
    // The signed-in account's record only; another account's is settled when it is back.
    const row = await table.getReplicatedRow(id);
    if (!row) continue;
    if ((await table.settle(id, row.ownerAuthUserId ?? null)) === 'settled') {
      recorded.push(row.data);
    }
  }
  await refreshAndAnnounceRecorded(recorded, refreshEntries);
  return [...new Set(recorded.map(payment => payment.showId))];
}
