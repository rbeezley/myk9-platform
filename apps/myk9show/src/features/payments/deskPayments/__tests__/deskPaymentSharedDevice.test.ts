/**
 * MYK9-2479, docs/plan-offline-desk-payments-shared-device.md § 2, through the REAL queue
 * and IndexedDB with two accounts on one device: a form-wide change by B waits while this
 * device holds a payment A saved that myK9Show has not confirmed, whatever state it is in,
 * and the message names nothing of A's payment.
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
import {
  readDeskPaymentLines,
  removeRefusedDeskPayment,
  retryDeskPayment,
} from '../deskPaymentReader';
import { FORM_CHANGE_OTHER_ACCOUNT, formChangeBlockedBy } from '../formChangeGuard';
import { saveDeskPayment } from '../saveDeskPayment';

const SHOW = 'show-1';
const ENROLLMENT = 'enr-1';
const ID = '6f1d2c3b-4a59-4e8d-9b7a-0c1e2f3a4b5c';
const FORM = { showId: SHOW, exhibitorName: 'Jane Smith' };
const A = 'secretary-a';
const B = 'secretary-b';

const CASH: Extract<EnrollmentLedgerAction, { kind: 'payment' }> = {
  kind: 'payment',
  method: 'cash',
  amount: 37.5,
  receivedOn: '2026-11-26',
  reference: null,
  clientPaymentId: ID,
};

/** One RPC answer: recorded, refused with a code, or committed with the answer lost. */
type Answer = { code: string; message: string } | 'ok' | 'lost';

describe('a form-wide change on a shared device (MYK9-2479, shared-device plan § 2)', () => {
  let answers: Answer[];
  let account: string;
  let manager: MutationManager;
  let table: DeskPaymentsTable;
  let deps: DeskPaymentDeps;

  async function store(name: string): Promise<PendingMutation[]> {
    const db = await databaseManager.getDatabase('test');
    return (await db.getAll(name)) as PendingMutation[];
  }

  function setOnline(online: boolean) {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online);
  }

  async function uploadNow() {
    setOnline(true);
    const db = await databaseManager.getDatabase('test');
    for (const queued of await store(REPLICATION_STORES.PENDING_MUTATIONS)) {
      await db.put(REPLICATION_STORES.PENDING_MUTATIONS, { ...queued, nextRetryAt: 0 });
    }
    await manager.uploadPendingMutations();
  }

  async function aSavesCashOffline() {
    account = A;
    setOnline(false);
    await saveDeskPayment(ENROLLMENT, CASH, FORM, deps);
  }

  async function onlyLine() {
    const [line] = await readDeskPaymentLines(SHOW, deps);
    if (!line) throw new Error('expected one payment line');
    return line;
  }

  beforeEach(async () => {
    await databaseManager.reset();
    answers = [];
    account = A;
    const client = {
      rpc: vi.fn(async () => {
        const answer = answers.shift() ?? 'ok';
        if (answer === 'lost') throw new TypeError('Failed to fetch');
        return answer === 'ok'
          ? { data: { id: ENROLLMENT, payment_status: 'pending' }, error: null, status: 200 }
          : { data: null, error: answer, status: 400 };
      }),
    } as unknown as SupabaseClient;
    manager = new MutationManager(client, {
      maxRetries: 3,
      retryBackoffBase: 60_000,
      getCurrentUserId: async () => account,
      getCurrentUploadContext: async () => ({ authUserId: account, supabaseClient: client }),
    });
    table = new DeskPaymentsTable();
    table.setMutationManager(manager);
    deps = {
      table,
      queue: manager,
      canReadLedger: vi.fn(async () => true),
      ledgerIds: vi.fn(async () => new Set<string>()),
      isOnline: () => navigator.onLine !== false,
      now: () => Date.now(),
      refreshEntries: vi.fn(async () => undefined),
    };
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    manager.destroy();
    await databaseManager.reset();
  });

  it("A's waiting payment holds B's change, names nothing of it, and frees it once sent", async () => {
    await aSavesCashOffline();

    account = B;
    const held = await formChangeBlockedBy(ENROLLMENT, table);
    expect(held).toBe(FORM_CHANGE_OTHER_ACCOUNT);
    expect(held).not.toMatch(/\$|37|cash/i);
    // B's own reads still show none of A's payments.
    expect(await readDeskPaymentLines(SHOW, deps)).toEqual([]);

    account = A;
    await uploadNow();
    account = B;
    expect(await formChangeBlockedBy(ENROLLMENT, table)).toBeNull();
  });

  it('a send that committed with its answer lost still holds, saying "cannot confirm"', async () => {
    await aSavesCashOffline();
    answers = ['lost'];
    await uploadNow();
    expect(await store(REPLICATION_STORES.PENDING_MUTATIONS)).toHaveLength(1);

    account = B;
    const held = await formChangeBlockedBy(ENROLLMENT, table);
    expect(held).toContain('cannot confirm');
    expect(held).not.toContain('has not reached');
  });

  it('a stopped payment holds B until A tries it again and the send succeeds', async () => {
    await aSavesCashOffline();
    answers = ['lost', 'lost', 'lost'];
    for (let attempt = 0; attempt < 3; attempt += 1) await uploadNow();
    expect(await store(REPLICATION_STORES.FAILED_MUTATIONS)).toHaveLength(1);

    account = B;
    expect(await formChangeBlockedBy(ENROLLMENT, table)).toBe(FORM_CHANGE_OTHER_ACCOUNT);

    account = A;
    await retryDeskPayment(await onlyLine(), deps);
    await uploadNow();
    account = B;
    expect(await formChangeBlockedBy(ENROLLMENT, table)).toBeNull();
  });

  it('a refused payment holds B until A removes it', async () => {
    await aSavesCashOffline();
    answers = [{ code: '22023', message: 'a payment amount must be greater than zero' }];
    await uploadNow();

    account = B;
    expect(await formChangeBlockedBy(ENROLLMENT, table)).toBe(FORM_CHANGE_OTHER_ACCOUNT);

    account = A;
    const line = await onlyLine();
    expect(line.state).toBe('refused');
    await removeRefusedDeskPayment(line, deps);
    account = B;
    expect(await formChangeBlockedBy(ENROLLMENT, table)).toBeNull();
  });

  it("B's own payment is named first; A's is only counted", async () => {
    await aSavesCashOffline();
    account = B;
    await saveDeskPayment(
      ENROLLMENT,
      { ...CASH, amount: 10, clientPaymentId: '7a2e3d4c-5b6a-4f9e-8c7b-1d2e3f4a5b6c' },
      FORM,
      deps
    );

    expect(await table.unconfirmedForEnrollment(ENROLLMENT)).toMatchObject({
      mine: [{ amount: 10 }],
      others: 1,
    });
    expect(await formChangeBlockedBy(ENROLLMENT, table)).toMatch(
      /^Not changed: A cash payment of \$10\.00 for this form is saved on this device/
    );
  });
});
