import type { MutationManager } from '@myk9/replication';
import { canReadShowLedger, listLedgerClientPaymentIds } from '@/services/database/show-payments';
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
  /** The only path a desk payment is sent on: no direct RPC call exists (MYK9-2479). */
  queue: QueueActions;
  canReadLedger: (showId: string) => Promise<boolean>;
  ledgerIds: (ids: string[]) => Promise<Set<string>>;
  isOnline: () => boolean;
  now: () => number;
}

// Wrapped, not referenced: the ledger module is read when called, not when this one loads.
export const defaultDeskPaymentDeps: DeskPaymentDeps = {
  table: deskPaymentsTable,
  queue: mutationManager,
  canReadLedger: showId => canReadShowLedger(showId),
  ledgerIds: ids => listLedgerClientPaymentIds(ids),
  isOnline: () => typeof navigator === 'undefined' || navigator.onLine !== false,
  now: () => Date.now(),
};
