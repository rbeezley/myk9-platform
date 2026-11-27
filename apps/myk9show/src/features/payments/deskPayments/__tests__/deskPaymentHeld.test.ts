/**
 * MYK9-2479 (Codex round 6 on #4461), through the REAL queue and IndexedDB:
 * - a form-wide change waits while this device holds an unsent payment for the form;
 * - a form shows what this device holds before a slow ledger check answers;
 * - settling one payment leaves every other queued write alone.
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
import { readDeskPaymentLines } from '../deskPaymentReader';
import { FORM_CHANGE_UNREADABLE, formChangeBlockedBy } from '../formChangeGuard';
import { saveDeskPayment } from '../saveDeskPayment';
import type { DeskPaymentLine } from '../deskPaymentTypes';

const SHOW = 'show-1';
const ENROLLMENT = 'enr-1';
const ID = '6f1d2c3b-4a59-4e8d-9b7a-0c1e2f3a4b5c';
const OTHER_ID = '7a2e3d4c-5b6a-4f9e-8c7b-1d2e3f4a5b6c';
const FORM = { showId: SHOW, exhibitorName: 'Jane Smith' };

function payment(
  clientPaymentId: string,
  amount = 25
): Extract<EnrollmentLedgerAction, { kind: 'payment' }> {
  return {
    kind: 'payment',
    method: 'cash',
    amount,
    receivedOn: '2026-11-26',
    reference: null,
    clientPaymentId,
  };
}

type Answer = { code: string; message: string } | 'ok';

describe('desk payments held on this device (MYK9-2479, Codex round 6)', () => {
  let answers: Answer[];
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

  beforeEach(async () => {
    await databaseManager.reset();
    answers = [];
    const client = {
      rpc: vi.fn(async () => {
        const answer = answers.shift() ?? 'ok';
        return answer === 'ok'
          ? { data: { id: ENROLLMENT, payment_status: 'paid_by_cash' }, error: null, status: 200 }
          : { data: null, error: answer, status: 400 };
      }),
    } as unknown as SupabaseClient;
    manager = new MutationManager(client, {
      maxRetries: 3,
      retryBackoffBase: 60_000,
      getCurrentUserId: async () => 'secretary-a',
      getCurrentUploadContext: async () => ({ authUserId: 'secretary-a', supabaseClient: client }),
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

  it('Payment Due waits while a payment for the form is unsent, and names it', async () => {
    setOnline(false);
    await saveDeskPayment(ENROLLMENT, payment(ID, 37.5), FORM, deps);

    expect(await formChangeBlockedBy(ENROLLMENT, table)).toBe(
      'Not changed: A cash payment of $37.50 for this form is saved on this device, and myK9Show has not confirmed it yet. Wait until the line under the balance clears, or remove a refused payment, then try again.'
    );
    // Another form is not held by it.
    expect(await formChangeBlockedBy('enr-2', table)).toBeNull();

    await uploadNow();
    expect(await formChangeBlockedBy(ENROLLMENT, table)).toBeNull();
  });

  it('several unsent payments are counted, and an unreadable device refuses the change', async () => {
    setOnline(false);
    await saveDeskPayment(ENROLLMENT, payment(ID), FORM, deps);
    await saveDeskPayment(ENROLLMENT, payment(OTHER_ID), FORM, deps);

    expect(await formChangeBlockedBy(ENROLLMENT, table)).toMatch(
      /^Not changed: 2 payments for this form are saved on this device, and myK9Show has not confirmed them yet\./
    );

    vi.spyOn(table, 'unconfirmedForEnrollment').mockRejectedValue(new Error('IndexedDB closed'));
    expect(await formChangeBlockedBy(ENROLLMENT, table)).toBe(FORM_CHANGE_UNREADABLE);
  });

  it('a stopped payment shows at once, unchecked, while the ledger check is slow', async () => {
    setOnline(false);
    await saveDeskPayment(ENROLLMENT, payment(ID), FORM, deps);
    answers = [{ code: '22023', message: 'a payment amount must be greater than zero' }];
    await uploadNow();
    expect(await store(REPLICATION_STORES.FAILED_MUTATIONS)).toHaveLength(1);

    let answerCheck: (visible: boolean) => void = () => undefined;
    deps.canReadLedger = vi.fn(
      () =>
        new Promise<boolean>(resolve => {
          answerCheck = resolve;
        })
    );
    const shown: DeskPaymentLine[][] = [];
    const read = readDeskPaymentLines(SHOW, deps, undefined, lines => shown.push(lines));

    await vi.waitFor(() => expect(shown).toHaveLength(1));
    expect(shown[0]).toMatchObject([{ payment: { id: ID }, state: 'not-checked' }]);

    answerCheck(true);
    expect(await read).toMatchObject([{ payment: { id: ID }, state: 'refused' }]);
  });

  it('settling one payment leaves other payments and other tables’ queued writes', async () => {
    setOnline(false);
    await saveDeskPayment(ENROLLMENT, payment(ID), FORM, deps);
    await saveDeskPayment(ENROLLMENT, payment(OTHER_ID), FORM, deps);
    const db = await databaseManager.getDatabase('test');
    const [queued] = await store(REPLICATION_STORES.PENDING_MUTATIONS);
    await db.put(REPLICATION_STORES.PENDING_MUTATIONS, {
      ...queued!,
      id: 'score-1',
      tableName: 'entries',
      rowId: ID,
    });

    expect(await table.settle(ID, 'secretary-a')).toBe('settled');

    const left = await store(REPLICATION_STORES.PENDING_MUTATIONS);
    expect(left.map(m => [m.tableName, String(m.rowId)]).sort()).toEqual([
      ['entries', ID],
      ['show_payments', OTHER_ID],
    ]);
  });
});
