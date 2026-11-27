import {
  REPLICATION_STORES,
  ReplicatedTable,
  type PendingMutation,
  type ReplicatedRow,
  type SyncResult,
} from '@myk9/replication';
import { logger } from '@myk9/core';
import {
  DESK_PAYMENT_RPC,
  DESK_PAYMENTS_TABLE,
  type DeskPaymentSettleResult,
  type LocalDeskPayment,
} from './deskPaymentTypes';

/** The RPC's named arguments for one desk payment: the amount is always explicit. */
export function deskPaymentRpcArgs(payment: LocalDeskPayment): Record<string, unknown> {
  return {
    p_enrollment_id: payment.enrollmentId,
    p_kind: 'payment',
    p_amount: payment.amount,
    p_method: payment.method,
    p_received_on: payment.receivedOn,
    p_reference: payment.reference?.trim() || null,
    p_client_payment_id: payment.id,
  };
}

/** A local payment, the account it was saved for, and whether the queue acknowledged it. */
export interface StoredDeskPayment {
  payment: LocalDeskPayment;
  owner: string | null;
  acknowledged: boolean;
}

/**
 * MYK9-2479: the desk's cash and check payments held on this device. Nothing is
 * downloaded into it: the ledger is the server's, read online by the close-out.
 * A record lives here from the moment she saves it until the server's answer, an
 * acknowledged upload, or a ledger read proves it recorded (or she removes a
 * proven refusal). Its queue row is committed in the same transaction
 * (`writeAndQueue`), and the record is stamped with the signed-in account.
 */
export class DeskPaymentsTable extends ReplicatedTable<LocalDeskPayment> {
  constructor() {
    super(DESK_PAYMENTS_TABLE, { logger });
  }

  override usesAccountOwnedRows(): boolean {
    return true;
  }

  /** Local records only; there is nothing to pull. */
  async sync(): Promise<SyncResult> {
    return {
      tableName: this.getTableName(),
      success: true,
      operation: 'incremental-sync',
      rowsAffected: 0,
      duration: 0,
    };
  }

  protected resolveConflict(local: LocalDeskPayment): LocalDeskPayment {
    return local;
  }

  /**
   * Save the record and its queue row in one transaction. `holdUploadUntil` keeps
   * every upload pass off it while the caller sends it itself; a reload in that
   * window leaves it to the queue, which sends it once the hold passes. Resolves to the
   * account the record was stamped with: the one account that may settle it.
   */
  async queuePayment(payment: LocalDeskPayment, holdUploadUntil?: number): Promise<string | null> {
    const args = deskPaymentRpcArgs(payment);
    const { mutationId } = await this.writeAndQueue(payment.id, payment, {
      operation: 'INSERT',
      payload: args,
      rpc: { name: DESK_PAYMENT_RPC, args },
      holdUploadUntil,
    });
    if (!mutationId) throw new Error('The payment could not be saved on this device.');
    const row = await this.getReplicatedRowIncludingOtherAccounts(payment.id);
    return row?.ownerAuthUserId ?? null;
  }

  /** This account's local payments for one show. Throws when the device could not read them. */
  async listForShow(showId: string): Promise<StoredDeskPayment[]> {
    const payments = await this.getByShowOrThrow(showId);
    const stored = await Promise.all(
      payments.map(async payment => {
        const row = await this.getReplicatedRow(payment.id);
        return row
          ? { payment: row.data, owner: row.ownerAuthUserId ?? null, acknowledged: !row.isDirty }
          : null;
      })
    );
    return stored.filter((entry): entry is StoredDeskPayment => entry !== null);
  }

  /**
   * A send of it has begun (a dead letter is the proof), so its line can no longer say
   * "waiting to send" once it is queued again. Changes that flag alone, in place: the
   * record stays exactly as dirty as it was, and nothing is queued.
   */
  async markSendBegun(id: string): Promise<void> {
    const owner = await this.getCurrentAuthUserId();
    const db = await this.init();
    const tx = db.transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readwrite');
    const key = [this.tableName, id];
    const row = (await tx.store.get(key)) as ReplicatedRow<LocalDeskPayment> | undefined;
    if (row && owner && row.ownerAuthUserId === owner && !row.data.sendBegun) {
      await tx.store.put({ ...row, data: { ...row.data, sendBegun: true } });
    }
    await tx.done;
  }

  /**
   * The payment is proven recorded (or a proven refusal was removed): delete its
   * record, its queue row and its dead letter in ONE transaction, so no half of it
   * is left to send or to show. Owner-explicit (Codex round 2 on #4461): `expectedOwner`
   * is the account it was saved for, and it must be the signed-in account and own every
   * piece of it. Otherwise NOTHING is deleted and the answer is `not-owner`, so a shared
   * device that changed accounts mid-request never reads "settled" while it still queues.
   */
  async settle(id: string, expectedOwner: string | null): Promise<DeskPaymentSettleResult> {
    if (!expectedOwner || (await this.getCurrentAuthUserId()) !== expectedOwner) {
      return 'not-owner';
    }
    const owner = expectedOwner;
    const db = await this.init();
    const tx = db.transaction(
      [
        REPLICATION_STORES.REPLICATED_TABLES,
        REPLICATION_STORES.PENDING_MUTATIONS,
        REPLICATION_STORES.FAILED_MUTATIONS,
      ],
      'readwrite'
    );
    const rows = tx.objectStore(REPLICATION_STORES.REPLICATED_TABLES);
    const key = [this.tableName, id];
    const row = (await rows.get(key)) as ReplicatedRow<LocalDeskPayment> | undefined;
    const queueStores = [
      REPLICATION_STORES.PENDING_MUTATIONS,
      REPLICATION_STORES.FAILED_MUTATIONS,
    ] as const;
    const queued: Array<{
      storeName: (typeof queueStores)[number];
      mutation: PendingMutation;
    }> = [];
    for (const storeName of queueStores) {
      const mutations = (await tx.objectStore(storeName).getAll()) as PendingMutation[];
      for (const mutation of mutations) {
        if (mutation.tableName === this.tableName && String(mutation.rowId) === id) {
          queued.push({ storeName, mutation });
        }
      }
    }
    // Every piece is checked before any is deleted: all of it goes, or none of it.
    const notOwned =
      (row !== undefined && row.ownerAuthUserId !== owner) ||
      queued.some(({ mutation }) => mutation.authUserId !== owner);
    if (notOwned) {
      await tx.done;
      return 'not-owner';
    }
    if (row) await rows.delete(key);
    for (const { storeName, mutation } of queued) {
      await tx.objectStore(storeName).delete(mutation.id);
    }
    await tx.done;
    await this.notifyListeners();
    return 'settled';
  }
}
