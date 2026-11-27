/**
 * MYK9-2479 through the REAL queue: a desk payment saved on this device and sent ONLY by
 * the queue, replayed under the same id against a fake server that dedupes on the client
 * payment id the way `record_enrollment_payment` does.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  databaseManager,
  MutationManager,
  REPLICATION_STORES,
  type PendingMutation,
} from '@myk9/replication';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  EnrollmentLedgerAction,
  RecordedEnrollmentPayment,
} from '@/features/payments/showPaymentLedger';
import { recordEnrollmentPayment } from '@/services/database/show-payments';
import { DeskPaymentsTable } from '../DeskPaymentsTable';
import type { DeskPaymentDeps } from '../deskPaymentDeps';
import { settleUploadedDeskPayments, DESK_PAYMENTS_RECORDED_EVENT } from '../deskPaymentEvents';
import {
  readDeskPaymentLines,
  removeRefusedDeskPayment,
  retryDeskPayment,
} from '../deskPaymentReader';
import { DESK_PAYMENT_WAIT_MS, saveDeskPayment } from '../saveDeskPayment';

// The direct ledger RPC exists for refunds and resets; a desk payment must never use it.
vi.mock('@/services/database/show-payments', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/database/show-payments')>()),
  recordEnrollmentPayment: vi.fn(),
}));

const SHOW = 'show-1';
const ENROLLMENT = 'enr-1';
const ID = '6f1d2c3b-4a59-4e8d-9b7a-0c1e2f3a4b5c';
const FORM = { showId: SHOW, exhibitorName: 'Jane Smith' };
const PAYMENT: Extract<EnrollmentLedgerAction, { kind: 'payment' }> = {
  kind: 'payment',
  method: 'cash',
  amount: 25,
  receivedOn: '2026-11-26',
  reference: null,
  clientPaymentId: ID,
};

type Behavior = 'drop' | 'commit-then-drop' | { code: string; message: string };
type RpcResult = {
  data: RecordedEnrollmentPayment | null;
  error: { message: string; code: string } | null;
  status: number;
};

const ANSWER: RecordedEnrollmentPayment = {
  id: ENROLLMENT,
  payment_status: 'paid_by_cash',
  paid_amount: '25.00',
  payment_reference: null,
  refund_amount: null,
  refund_notes: null,
  refunded_at: null,
};

describe('desk payments on the offline queue (MYK9-2479)', () => {
  let auth: string;
  let online: boolean;
  let ledger: Map<string, Record<string, unknown>>;
  let rpcCalls: Array<Record<string, unknown>>;
  let behaviors: Behavior[];
  let manager: MutationManager;
  let table: DeskPaymentsTable;
  let deps: DeskPaymentDeps;

  /** The server: records an id once and answers a repeat from the form as it stands. */
  async function serve(args: Record<string, unknown>): Promise<RpcResult> {
    rpcCalls.push(args);
    const behavior = behaviors.shift();
    const record = () => {
      const id = args.p_client_payment_id as string;
      if (!ledger.has(id)) ledger.set(id, args);
    };
    if (behavior === 'drop' || behavior === 'commit-then-drop') {
      if (behavior === 'commit-then-drop') record();
      return { data: null, error: { message: 'TypeError: Failed to fetch', code: '' }, status: 0 };
    }
    if (behavior) return { data: null, error: behavior, status: 400 };
    record();
    return { data: ANSWER, error: null, status: 200 };
  }

  function createQueue(maxRetries = 3, retryBackoffBase = 60_000) {
    manager?.destroy();
    const client = {
      rpc: vi.fn(async (_name: string, args: Record<string, unknown>) => serve(args)),
    } as unknown as SupabaseClient;
    manager = new MutationManager(client, {
      maxRetries,
      retryBackoffBase,
      getCurrentUserId: async () => auth,
      getCurrentUploadContext: async () => ({ authUserId: auth, supabaseClient: client }),
    });
    table = new DeskPaymentsTable();
    table.setMutationManager(manager);
    deps = {
      table,
      queue: manager,
      canReadLedger: vi.fn(async () => true),
      ledgerIds: vi.fn(async (ids: string[]) => new Set(ids.filter(id => ledger.has(id)))),
      isOnline: () => online,
      now: () => Date.now(),
      refreshEntries: vi.fn(async () => undefined),
    };
  }

  async function store(name: string): Promise<PendingMutation[]> {
    const db = await databaseManager.getDatabase('test');
    return (await db.getAll(name)) as PendingMutation[];
  }

  async function goOffline() {
    online = false;
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  }

  async function goOnlineAndUpload() {
    online = true;
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    const db = await databaseManager.getDatabase('test');
    for (const queued of await store(REPLICATION_STORES.PENDING_MUTATIONS)) {
      await db.put(REPLICATION_STORES.PENDING_MUTATIONS, { ...queued, nextRetryAt: 0 });
    }
    await manager.uploadPendingMutations();
  }

  /** Every request carried the one id and the amount she was shown: no path minted another. */
  function expectOneIdAndAmount() {
    expect(rpcCalls.length).toBeGreaterThan(0);
    for (const call of rpcCalls) {
      expect(call).toMatchObject({ p_client_payment_id: ID, p_amount: 25 });
    }
  }

  beforeEach(async () => {
    await databaseManager.reset();
    auth = 'secretary-a';
    online = true;
    ledger = new Map();
    rpcCalls = [];
    behaviors = [];
    createQueue();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    manager.destroy();
    await databaseManager.reset();
  });

  it('queues the payment under its own id with the explicit amount, in one write', async () => {
    const prepare = vi.spyOn(manager, 'prepareMutation');
    await goOffline();

    await saveDeskPayment(ENROLLMENT, PAYMENT, FORM, deps);

    expect(prepare).toHaveBeenCalledWith(
      'show_payments',
      'INSERT',
      ID,
      expect.objectContaining({ p_client_payment_id: ID, p_amount: 25 }),
      undefined,
      {
        name: 'record_enrollment_payment',
        args: expect.objectContaining({ p_client_payment_id: ID, p_amount: 25 }),
      },
      undefined
    );
  });

  it('an amount that is not whole cents is not saved, and says why', async () => {
    const result = await saveDeskPayment(ENROLLMENT, { ...PAYMENT, amount: 0.005 }, FORM, deps);

    expect(result).toMatchObject({ kind: 'not-saved', reason: 'invalid-amount' });
    expect(await table.listForShow(SHOW)).toEqual([]);
  });

  // Option A (Codex round 3 on #4461): one send path, the queue's, under its owner's session.
  it('never calls the ledger RPC itself: it queues the payment and asks the queue to send it', async () => {
    const sendNow = vi.spyOn(manager, 'sendRowNow');

    await saveDeskPayment(ENROLLMENT, PAYMENT, FORM, deps);

    expect(sendNow).toHaveBeenCalledWith('show_payments', ID);
    expect(recordEnrollmentPayment).not.toHaveBeenCalled();
    expect(rpcCalls).toHaveLength(1);
    expectOneIdAndAmount();
  });

  it('acknowledged within the wait: saved, its entries re-read, then the show announced once', async () => {
    // Codex round 4 (P2): the entries replica holds each entry's payment_status, so it is
    // re-read BEFORE the announcement reloads the forms, or Request payment stays offered.
    const recorded = vi.fn(() => expect(deps.refreshEntries).toHaveBeenCalledTimes(1));
    window.addEventListener(DESK_PAYMENTS_RECORDED_EVENT, recorded);

    const result = await saveDeskPayment(ENROLLMENT, PAYMENT, FORM, deps);

    window.removeEventListener(DESK_PAYMENTS_RECORDED_EVENT, recorded);
    expect(result).toEqual({ kind: 'saved' });
    expect(await table.listForShow(SHOW)).toEqual([]);
    expect(await store(REPLICATION_STORES.PENDING_MUTATIONS)).toEqual([]);
    expect(recorded).toHaveBeenCalledTimes(1);
    expect(deps.refreshEntries).toHaveBeenCalledWith(SHOW, [ENROLLMENT]);
    expect((recorded.mock.calls[0] as unknown as [CustomEvent])[0].detail.showIds).toEqual([SHOW]);
    expect(ledger.size).toBe(1);
  });

  it('a failed entries re-read after an acknowledged send is still saved and announced', async () => {
    vi.mocked(deps.refreshEntries).mockRejectedValueOnce(new Error('read-back failed'));
    const recorded = vi.fn();
    window.addEventListener(DESK_PAYMENTS_RECORDED_EVENT, recorded);

    const result = await saveDeskPayment(ENROLLMENT, PAYMENT, FORM, deps);

    window.removeEventListener(DESK_PAYMENTS_RECORDED_EVENT, recorded);
    expect(result).toEqual({ kind: 'saved' });
    expect(recorded).toHaveBeenCalledTimes(1);
  });

  // Codex round 4 (P2): once it is saved on this device, nothing after it may throw past
  // the dialog. The queue owns the payment.
  it('a failed read of the send outcome after the save is queued, never thrown', async () => {
    vi.spyOn(table, 'sendOutcome').mockRejectedValue(new Error('IndexedDB read failed'));

    const result = await saveDeskPayment(ENROLLMENT, PAYMENT, FORM, deps);

    expect(result).toEqual({ kind: 'queued', sendBegun: true });
  });

  it('a 22023 on the first send is refused only once its record and queue row are gone', async () => {
    behaviors = [{ code: '22023', message: 'a payment amount must be greater than zero' }];

    const result = await saveDeskPayment(ENROLLMENT, PAYMENT, FORM, deps);

    expect(result).toMatchObject({ kind: 'refused' });
    const error = (result as { error: Error & { code?: string } }).error;
    expect([error.message, error.code]).toEqual([
      'a payment amount must be greater than zero',
      '22023',
    ]);
    expect(await table.listForShow(SHOW)).toEqual([]);
    expect(await store(REPLICATION_STORES.PENDING_MUTATIONS)).toEqual([]);
    expect(await store(REPLICATION_STORES.FAILED_MUTATIONS)).toEqual([]);
  });

  // Codex round 4 (P2): a dead letter is never "queued": it will not be sent on its own.
  it('a first-send refusal it could not clean up is stopped on its line, never refused', async () => {
    behaviors = [{ code: '22023', message: 'a payment amount must be greater than zero' }];
    vi.spyOn(table, 'settle').mockRejectedValueOnce(new Error('IndexedDB write failed'));

    const result = await saveDeskPayment(ENROLLMENT, PAYMENT, FORM, deps);

    expect(result).toEqual({ kind: 'stopped' });
    const lines = await readDeskPaymentLines(SHOW, deps);
    expect(lines.map(line => [line.payment.id, line.state])).toEqual([[ID, 'refused']]);
  });

  it('a refusal after a failed first send is stopped, not refused: it may follow a recorded one', async () => {
    createQueue(3, 1);
    behaviors = ['drop', { code: '22023', message: 'a payment amount must be greater than zero' }];

    const result = await saveDeskPayment(ENROLLMENT, PAYMENT, FORM, deps);

    expect(rpcCalls).toHaveLength(2);
    expect(result).toEqual({ kind: 'stopped' });
    expect(await store(REPLICATION_STORES.FAILED_MUTATIONS)).toHaveLength(1);
    expectOneIdAndAmount();
  });

  it('no outcome within the wait: queued, and the queue sends it again under the same id', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    behaviors = ['drop'];

    const pending = saveDeskPayment(ENROLLMENT, PAYMENT, FORM, deps);
    await vi.waitFor(() => expect(rpcCalls).toHaveLength(1));
    await vi.advanceTimersByTimeAsync(DESK_PAYMENT_WAIT_MS);

    expect(await pending).toEqual({ kind: 'queued', sendBegun: true });
    vi.useRealTimers();
    const lines = await readDeskPaymentLines(SHOW, deps);
    expect(lines.map(line => line.state)).toEqual(['unconfirmed']);
    expectOneIdAndAmount();
  });

  it('offline: saved and waiting to send, then sent once when the connection returns', async () => {
    await goOffline();

    const result = await saveDeskPayment(ENROLLMENT, PAYMENT, FORM, deps);

    expect(result).toEqual({ kind: 'queued', sendBegun: false });
    expect(rpcCalls).toHaveLength(0);
    const waiting = await readDeskPaymentLines(SHOW, deps);
    expect(waiting.map(line => line.state)).toEqual(['waiting']);
    expect(waiting[0]!.payment).toMatchObject({ amount: 25, exhibitorName: 'Jane Smith' });

    await goOnlineAndUpload();

    expect(ledger.size).toBe(1);
    expect(await readDeskPaymentLines(SHOW, deps)).toEqual([]);
    expect(await table.listForShow(SHOW)).toEqual([]);
    expect(await store(REPLICATION_STORES.FAILED_MUTATIONS)).toEqual([]);
    expectOneIdAndAmount();
  });

  it('a reload before the send keeps the record and its line, and replays it once', async () => {
    await goOffline();
    await saveDeskPayment(ENROLLMENT, PAYMENT, FORM, deps);
    createQueue();

    const lines = await readDeskPaymentLines(SHOW, deps);
    expect(lines.map(line => line.state)).toEqual(['waiting']);

    await goOnlineAndUpload();

    expect(rpcCalls).toHaveLength(1);
    expect(await readDeskPaymentLines(SHOW, deps)).toEqual([]);
    expectOneIdAndAmount();
  });

  it('replay twice: the first send commits then loses its answer, the second is answered', async () => {
    await goOffline();
    await saveDeskPayment(ENROLLMENT, PAYMENT, FORM, deps);
    behaviors = ['commit-then-drop'];

    await goOnlineAndUpload();
    expect(ledger.size).toBe(1);
    expect(await store(REPLICATION_STORES.PENDING_MUTATIONS)).toHaveLength(1);

    await goOnlineAndUpload();

    expect(rpcCalls).toHaveLength(2);
    expect(ledger.size).toBe(1);
    expect(await store(REPLICATION_STORES.PENDING_MUTATIONS)).toEqual([]);
    expect(await store(REPLICATION_STORES.FAILED_MUTATIONS)).toEqual([]);
    expect(await readDeskPaymentLines(SHOW, deps)).toEqual([]);
    expectOneIdAndAmount();
  });

  it('a replayed payment settles its record, re-reads its entries and announces its show', async () => {
    await goOffline();
    await saveDeskPayment(ENROLLMENT, PAYMENT, FORM, deps);
    await goOnlineAndUpload();
    const recorded = vi.fn();
    window.addEventListener(DESK_PAYMENTS_RECORDED_EVENT, recorded);

    const shows = await settleUploadedDeskPayments(
      {
        tables: ['show_payments'],
        count: 1,
        mutations: [
          {
            tableName: 'show_payments',
            rowId: ID,
            operation: 'INSERT',
            rpcName: 'record_enrollment_payment',
          },
        ],
      },
      table,
      deps.refreshEntries
    );

    window.removeEventListener(DESK_PAYMENTS_RECORDED_EVENT, recorded);
    expect(deps.refreshEntries).toHaveBeenCalledWith(SHOW, [ENROLLMENT]);
    expect(shows).toEqual([SHOW]);
    expect((recorded.mock.calls[0]![0] as CustomEvent).detail.showIds).toEqual([SHOW]);
    expect(await table.listForShow(SHOW)).toEqual([]);
  });

  async function deadLetterWith(behavior: Behavior, maxRetries = 3) {
    createQueue(maxRetries);
    await goOffline();
    await saveDeskPayment(ENROLLMENT, PAYMENT, FORM, deps);
    behaviors = [behavior];
    await goOnlineAndUpload();
    expect(await store(REPLICATION_STORES.FAILED_MUTATIONS)).toHaveLength(1);
  }

  it('a 22023 she can check, with no ledger row, is Refused and may be removed', async () => {
    await deadLetterWith({ code: '22023', message: 'a payment amount must be greater than zero' });
    const [dead] = await store(REPLICATION_STORES.FAILED_MUTATIONS);
    expect(dead).toMatchObject({ failureKind: 'permanent', errorCode: '22023' });

    const [line] = await readDeskPaymentLines(SHOW, deps);

    expect(line).toMatchObject({
      state: 'refused',
      reason: 'a payment amount must be greater than zero',
    });
    await removeRefusedDeskPayment(line!, deps);
    expect(await readDeskPaymentLines(SHOW, deps)).toEqual([]);
    expect(await store(REPLICATION_STORES.FAILED_MUTATIONS)).toEqual([]);
  });

  it('a 22023 whose ledger she cannot read is Not checked, never Refused', async () => {
    await deadLetterWith({ code: '22023', message: 'enrollment enr-1 not found' });
    deps.canReadLedger = vi.fn(async () => false);

    const [line] = await readDeskPaymentLines(SHOW, deps);

    expect(line?.state).toBe('not-checked');
    await removeRefusedDeskPayment(line!, deps);
    expect(await table.listForShow(SHOW)).toHaveLength(1);
  });

  it('a failed access check is Not checked', async () => {
    await deadLetterWith({ code: '22023', message: 'enrollment enr-1 not found' });
    deps.canReadLedger = vi.fn(async () => {
      throw new Error('fetch failed');
    });

    const lines = await readDeskPaymentLines(SHOW, deps);

    expect(lines.map(line => line.state)).toEqual(['not-checked']);
  });

  it('a 42501 is Not checked even when the ledger is readable', async () => {
    await deadLetterWith({
      code: '42501',
      message: 'not authorized to record payments for enrollment enr-1',
    });

    const [line] = await readDeskPaymentLines(SHOW, deps);

    expect(line?.state).toBe('not-checked');
    expect(line?.failedMutationId).toBeDefined();
  });

  it('a max-retries dead letter the ledger later lists is settled, with no dead letter left', async () => {
    await deadLetterWith('commit-then-drop', 1);
    const [dead] = await store(REPLICATION_STORES.FAILED_MUTATIONS);
    expect(dead?.failureKind).toBe('max-retries');

    expect(await readDeskPaymentLines(SHOW, deps)).toEqual([]);

    expect(await store(REPLICATION_STORES.FAILED_MUTATIONS)).toEqual([]);
    expect(await table.listForShow(SHOW)).toEqual([]);
    expect(ledger.size).toBe(1);
    expect(deps.refreshEntries).toHaveBeenCalledWith(SHOW, [ENROLLMENT]);
  });

  it('a max-retries dead letter not in the ledger stops, and Try again resends the same id', async () => {
    await deadLetterWith('drop', 1);

    const [stopped] = await readDeskPaymentLines(SHOW, deps);
    expect(stopped?.state).toBe('unconfirmed-stopped');

    // Offline, so the read below sees it queued again before any pass sends it.
    await goOffline();
    await retryDeskPayment(stopped!, deps);
    const [requeued] = await readDeskPaymentLines(SHOW, deps);
    expect(requeued?.state).toBe('unconfirmed');
    await goOnlineAndUpload();

    expect(await readDeskPaymentLines(SHOW, deps)).toEqual([]);
    expect(ledger.size).toBe(1);
    expectOneIdAndAmount();
  });

  it("shows only the signed-in account's payments, also after an account switch", async () => {
    await goOffline();
    await saveDeskPayment(ENROLLMENT, PAYMENT, FORM, deps);

    auth = 'secretary-b';
    expect(await readDeskPaymentLines(SHOW, deps)).toEqual([]);

    auth = 'secretary-a';
    const lines = await readDeskPaymentLines(SHOW, deps);
    expect(lines.map(line => line.payment.id)).toEqual([ID]);
  });
});
