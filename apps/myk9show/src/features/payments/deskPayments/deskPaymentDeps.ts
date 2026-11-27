import type { MutationManager } from '@myk9/replication';
import type {
  EnrollmentLedgerAction,
  RecordedEnrollmentPayment,
} from '@/features/payments/showPaymentLedger';
import {
  canReadShowLedger,
  listLedgerClientPaymentIds,
  recordEnrollmentPayment,
} from '@/services/database/show-payments';
import { mutationManager } from '@/services/replication/sharedMutationManager';
import { DeskPaymentsTable } from './DeskPaymentsTable';

/** The device's desk payments, on the app's one queue. */
export const deskPaymentsTable = new DeskPaymentsTable();
deskPaymentsTable.setMutationManager(mutationManager);

type QueueActions = Pick<
  MutationManager,
  'sendRowNow' | 'retryFailedMutation' | 'getPendingMutationsForTable' | 'getFailedMutations'
>;

/** What the desk payment flow reads and writes, injectable for tests. */
export interface DeskPaymentDeps {
  table: DeskPaymentsTable;
  queue: QueueActions;
  /** The direct send with its bounded wait. */
  send: (
    enrollmentId: string,
    action: Extract<EnrollmentLedgerAction, { kind: 'payment' }>,
    signal: AbortSignal
  ) => Promise<RecordedEnrollmentPayment>;
  canReadLedger: (showId: string) => Promise<boolean>;
  ledgerIds: (ids: string[]) => Promise<Set<string>>;
  isOnline: () => boolean;
  now: () => number;
}

// Wrapped, not referenced: the ledger module is read when called, not when this one loads.
export const defaultDeskPaymentDeps: DeskPaymentDeps = {
  table: deskPaymentsTable,
  queue: mutationManager,
  send: (enrollmentId, action, signal) => recordEnrollmentPayment(enrollmentId, action, signal),
  canReadLedger: showId => canReadShowLedger(showId),
  ledgerIds: ids => listLedgerClientPaymentIds(ids),
  isOnline: () => typeof navigator === 'undefined' || navigator.onLine !== false,
  now: () => Date.now(),
};
