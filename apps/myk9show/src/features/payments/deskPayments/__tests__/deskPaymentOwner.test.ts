/**
 * MYK9-2479, Codex round 2 on #4461: settling a desk payment is owner-explicit. A shared
 * desk device can change accounts mid-request, and nothing of one account's payment is
 * removed, or reported refused, on another account's say.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  databaseManager,
  MutationManager,
  REPLICATION_STORES,
  type PendingMutation,
} from '@myk9/replication';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnrollmentLedgerAction } from '@/features/payments/showPaymentLedger';
import { DeskPaymentsTable } from '../DeskPaymentsTable';
import type { DeskPaymentDeps } from '../deskPaymentDeps';
import { saveDeskPayment } from '../saveDeskPayment';

const SHOW = 'show-1';
const ID = '2b7e4c1d-9a3f-4e6b-8c5d-1f0a2e3b4c6d';
const FORM = { showId: SHOW, exhibitorName: 'Jane Smith' };
const PAYMENT: Extract<EnrollmentLedgerAction, { kind: 'payment' }> = {
  kind: 'payment',
  method: 'cash',
  amount: 25,
  receivedOn: '2026-11-27',
  reference: null,
  clientPaymentId: ID,
};
const REFUSAL = { message: 'a payment amount must be greater than zero', code: '22023' };

describe('desk payments settle only for the account that saved them (MYK9-2479)', () => {
  let auth: string;
  let online: boolean;
  let manager: MutationManager;
  let table: DeskPaymentsTable;
  let deps: DeskPaymentDeps;
  /** The queue's client: the server refuses, after `onSend` (an account switch, say). */
  let onSend: () => void;

  beforeEach(async () => {
    await databaseManager.reset();
    auth = 'secretary-a';
    online = false;
    onSend = () => undefined;
    vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);
    const client = {
      rpc: vi.fn(async () => {
        onSend();
        return { data: null, error: REFUSAL, status: 400 };
      }),
    } as unknown as SupabaseClient;
    manager = new MutationManager(client, {
      maxRetries: 3,
      retryBackoffBase: 60_000,
      getCurrentUserId: async () => auth,
      getCurrentUploadContext: async () => ({ authUserId: auth, supabaseClient: client }),
    });
    table = new DeskPaymentsTable();
    table.setMutationManager(manager);
    deps = {
      table,
      queue: manager,
      canReadLedger: vi.fn(async () => true),
      ledgerIds: vi.fn(async () => new Set<string>()),
      isOnline: () => online,
      now: () => Date.now(),
      refreshEntries: vi.fn(async () => undefined),
    };
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    manager.destroy();
    await databaseManager.reset();
  });

  async function store(name: string): Promise<PendingMutation[]> {
    const db = await databaseManager.getDatabase('test');
    return (await db.getAll(name)) as PendingMutation[];
  }

  /** Saved offline, with a dead letter beside its queue row, as after an earlier refusal. */
  async function saveWithDeadLetter() {
    await saveDeskPayment('enr-1', PAYMENT, FORM, deps);
    const [queued] = await store(REPLICATION_STORES.PENDING_MUTATIONS);
    const db = await databaseManager.getDatabase('test');
    await db.put(REPLICATION_STORES.FAILED_MUTATIONS, {
      ...queued!,
      id: 'dead-1',
      failedAt: Date.now(),
      failureKind: 'permanent',
      errorCode: '22023',
    });
  }

  async function heldOnDevice() {
    return {
      record: (await table.getReplicatedRowIncludingOtherAccounts(ID))?.ownerAuthUserId,
      queued: (await store(REPLICATION_STORES.PENDING_MUTATIONS)).length,
      dead: (await store(REPLICATION_STORES.FAILED_MUTATIONS)).length,
    };
  }

  // Option A (Codex round 3 on #4461): one owner for the row and its queued send.
  it('the row and its queued send belong to the one account that saved them', async () => {
    await saveDeskPayment('enr-1', PAYMENT, FORM, deps);

    const row = await table.getReplicatedRowIncludingOtherAccounts(ID);
    const [queued] = await store(REPLICATION_STORES.PENDING_MUTATIONS);
    expect([row?.ownerAuthUserId, queued?.authUserId]).toEqual(['secretary-a', 'secretary-a']);
  });

  it('an account switch between the two fails the save before commit, with nothing queued', async () => {
    const prepare = manager.prepareMutation.bind(manager);
    vi.spyOn(manager, 'prepareMutation').mockImplementation(async (...args) => {
      const mutation = await prepare(...args);
      auth = 'secretary-b';
      return mutation;
    });

    const result = await saveDeskPayment('enr-1', PAYMENT, FORM, deps);

    expect(result).toMatchObject({ kind: 'not-saved', reason: 'not-stored' });
    expect(await table.getReplicatedRowIncludingOtherAccounts(ID)).toBeNull();
    expect(await store(REPLICATION_STORES.PENDING_MUTATIONS)).toEqual([]);
  });

  it('settles for the account that saved it: record, queue row and dead letter go', async () => {
    await saveWithDeadLetter();

    expect(await table.settle(ID, 'secretary-a')).toBe('settled');

    expect(await heldOnDevice()).toEqual({ record: undefined, queued: 0, dead: 0 });
  });

  it('with another account signed in, settles nothing and says so', async () => {
    await saveWithDeadLetter();
    auth = 'secretary-b';

    expect(await table.settle(ID, 'secretary-a')).toBe('not-owner');

    expect(await heldOnDevice()).toEqual({ record: 'secretary-a', queued: 1, dead: 1 });
  });

  it("leaves a row another account owns, even when asked for the signed-in one's", async () => {
    await saveWithDeadLetter();
    auth = 'secretary-b';

    expect(await table.settle(ID, 'secretary-b')).toBe('not-owner');

    expect(await heldOnDevice()).toEqual({ record: 'secretary-a', queued: 1, dead: 1 });
  });

  it('a refusal it could not settle for its owner is stopped on its line, never refused', async () => {
    online = true;
    vi.spyOn(table, 'settle').mockResolvedValueOnce('not-owner');

    const result = await saveDeskPayment('enr-1', PAYMENT, FORM, deps);

    expect(result).toEqual({ kind: 'stopped' });
    expect(await heldOnDevice()).toMatchObject({ record: 'secretary-a', dead: 1 });
  });

  it('an account change during the send keeps the first account’s payment, stopped', async () => {
    online = true;
    onSend = () => {
      auth = 'secretary-b';
    };

    const result = await saveDeskPayment('enr-1', PAYMENT, FORM, deps);

    expect(result).toEqual({ kind: 'stopped' });
    auth = 'secretary-a';
    expect((await table.listForShow(SHOW)).map(s => s.payment.id)).toEqual([ID]);
    expect(await heldOnDevice()).toMatchObject({ record: 'secretary-a', dead: 1 });
  });
});
