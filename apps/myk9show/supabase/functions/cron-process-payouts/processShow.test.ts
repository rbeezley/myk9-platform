// MYK9-2170: the payout run's per-show flow, end to end against an in-memory
// store that keeps the database's guards (one live row per show, the claim's
// brake re-read and approval binding from claim_show_payout_for_send, the
// reopen RPC's status guard), with the Stripe transfer calls observed.
import { describe, expect, it, vi } from 'vitest';
import type { ShowMoneyLock } from '../_shared/showMoneyLock';
import type { PayoutFailureOwner } from '../_shared/payoutFailureOwner';
import { processShow, type ProcessShowDeps, type StripeTransfers } from './processShow';
import type {
  ClaimInput,
  ClubStripeAccount,
  LatestAttempt,
  LivePayoutRow,
  PayoutStore,
  QueueWrite,
} from './payoutStore';

const SHOW = { id: 'show-1', name: 'Fall Trial', club_id: 'club-1', end_date: '2026-11-01' };
const ACCOUNT: ClubStripeAccount = {
  id: 'csa-1',
  stripe_account_id: 'acct_club',
  payouts_enabled: true,
  onboarding_complete: true,
  livemode: false,
};

interface Row extends LivePayoutRow {
  show_id: string;
  failure_reason: string | null;
  stripe_transfer_id: string | null;
  seq: number;
}

function makeWorld(opts: {
  amounts: number[];
  brake: boolean;
  rows?: Partial<Row>[];
  accounts?: ClubStripeAccount[];
  transfersAlreadyMade?: Array<{ id: string; amount: number }>;
  failQueueWrites?: boolean;
}) {
  let seq = 0;
  const rows: Row[] = (opts.rows ?? []).map(r => ({
    id: `row-${++seq}`,
    show_id: SHOW.id,
    status: 'pending',
    amount_cents: 0,
    approved_at: null,
    approved_amount_cents: null,
    approved_stripe_account_id: null,
    failure_reason: null,
    stripe_transfer_id: null,
    seq,
    ...r,
  }));
  const settings = { brake: opts.brake };
  const amounts = [...opts.amounts];
  const events: string[] = [];
  const isLive = (r: Row) => r.status !== 'failed';
  const liveFor = (showId: string) => rows.find(r => r.show_id === showId && isLive(r));
  const byId = (id: string) => rows.find(r => r.id === id)!;
  const insert = (r: Partial<Row>): string | null => {
    if (r.status !== 'failed' && liveFor(SHOW.id)) return null;
    const id = `row-${++seq}`;
    rows.push({
      id,
      show_id: SHOW.id,
      status: 'pending',
      amount_cents: 0,
      approved_at: null,
      approved_amount_cents: null,
      approved_stripe_account_id: null,
      failure_reason: null,
      stripe_transfer_id: null,
      seq,
      ...r,
    });
    return id;
  };

  const store: PayoutStore = {
    loadLiveRow: async showId => {
      const r = liveFor(showId);
      return r ? { ...r } : null;
    },
    loadLatestAttempt: async showId => {
      const latest = rows.filter(r => r.show_id === showId).sort((a, b) => b.seq - a.seq)[0];
      return latest ? ({ ...latest } as LatestAttempt) : null;
    },
    computePayoutCents: async () => (amounts.length > 1 ? amounts.shift()! : amounts[0]),
    loadAccounts: async () => opts.accounts ?? [ACCOUNT],
    loadClub: async () => ({ name: 'Club', email: 'club@example.test' }),
    updateLiveAmount: async (id, status, amount) => {
      const r = byId(id);
      if (r.status === status) r.amount_cents = amount;
    },
    closeOutZero: async (id, status) => {
      const r = byId(id);
      if (r.status === status) Object.assign(r, { status: 'completed', amount_cents: 0 });
    },
    insertPending: async (showId, accountId, amount) =>
      insert({ show_id: showId, status: 'pending', amount_cents: amount }) !== null,
    recordAwaitingApproval: async (input): Promise<QueueWrite> => {
      if (opts.failQueueWrites) return 'error';
      if (input.liveRow) {
        const r = byId(input.liveRow.id);
        if (r.status !== input.liveRow.status) return 'raced';
        Object.assign(r, { status: 'awaiting_approval', amount_cents: input.amountCents });
        return 'recorded';
      }
      return insert({ status: 'awaiting_approval', amount_cents: input.amountCents })
        ? 'recorded'
        : 'raced';
    },
    // Mirrors claim_show_payout_for_send.
    claimForSend: async (input: ClaimInput) => {
      const brake = settings.brake;
      if (input.liveRow) {
        const r = byId(input.liveRow.id);
        if (r.status !== input.liveRow.status) return null;
        if (!['pending', 'awaiting_approval', 'approved'].includes(r.status)) return null;
        const allowed =
          r.status === 'approved'
            ? r.approved_stripe_account_id === input.destination &&
              input.amountCents <= (r.approved_amount_cents ?? -1)
            : !brake;
        if (!allowed) return null;
        Object.assign(r, { status: 'processing', amount_cents: input.amountCents });
        return r.id;
      }
      const c = input.carried;
      if (c) {
        if (c.stripeAccountId !== input.destination || input.amountCents > c.amountCents) {
          return null;
        }
      } else if (brake) {
        return null;
      }
      return insert({
        status: 'processing',
        amount_cents: input.amountCents,
        approved_at: c?.approvedAt ?? null,
        approved_amount_cents: c?.amountCents ?? null,
        approved_stripe_account_id: c?.stripeAccountId ?? null,
      });
    },
    reopenApproval: async input => {
      const r = byId(input.rowId);
      if (r.status !== input.fromStatus) return 'raced';
      Object.assign(r, {
        status: 'awaiting_approval',
        amount_cents: input.amountCents,
        approved_at: null,
        approved_amount_cents: null,
        approved_stripe_account_id: null,
      });
      events.push(`reopened: ${input.reason}`);
      return 'recorded';
    },
    setAmount: async (id, amount) => {
      byId(id).amount_cents = amount;
    },
    markFailed: async (id, reason) => {
      Object.assign(byId(id), { status: 'failed', failure_reason: reason });
    },
    markCompleted: async (id, input) => {
      Object.assign(byId(id), {
        status: 'completed',
        stripe_transfer_id: input.transferId,
        ...(input.amountCents === undefined ? {} : { amount_cents: input.amountCents }),
      });
    },
    insertReconciledCompleted: async input =>
      insert({
        status: 'completed',
        amount_cents: input.amountCents,
        stripe_transfer_id: input.transferId,
      })
        ? 'recorded'
        : 'raced',
    claimDueReminders: async () => [],
  };

  const made: Array<{ id: string; amount: number }> = [...(opts.transfersAlreadyMade ?? [])];
  const create = vi.fn<StripeTransfers['create']>(async params => {
    const transfer = { id: `tr_${made.length + 1}`, amount: params.amount };
    made.push(transfer);
    return { id: transfer.id };
  });
  const list = vi.fn<StripeTransfers['list']>(async () => ({ data: made.slice(0, 1) }));

  const locks = new Set<string>();
  const acquireLock = async (showId: string): Promise<ShowMoneyLock> => {
    if (locks.has(showId)) return { ok: false, reason: 'locked' };
    locks.add(showId);
    return { ok: true, lockId: 'lock', release: async () => void locks.delete(showId) };
  };

  const alert = vi.fn(async () => {});
  const transferFailed = vi.fn(
    async (_input: { owner: PayoutFailureOwner; failedRowId: string }) => {}
  );
  const deps = (brakeOnAtStart = opts.brake): ProcessShowDeps => ({
    store,
    transfers: { create, list },
    stripeLivemode: false,
    brakeOn: brakeOnAtStart,
    alert,
    acquireLock,
    notices: { cannotReceiveYet: async () => {}, payoutSent: async () => {}, transferFailed },
  });

  return { rows, settings, events, create, list, alert, deps };
}

const APPROVED = {
  status: 'approved',
  amount_cents: 10_000,
  approved_at: '2026-11-15T10:00:00.000Z',
  approved_amount_cents: 10_000,
  approved_stripe_account_id: 'acct_club',
};

describe('cron-process-payouts with the payout brake (MYK9-2170)', () => {
  it('brake on: records the payout as awaiting approval and creates no transfer', async () => {
    const w = makeWorld({ amounts: [10_000], brake: true });
    const summary: Record<string, number> = {};
    await processShow(w.deps(), SHOW, summary);
    expect(w.create).not.toHaveBeenCalled();
    expect(w.rows).toMatchObject([{ status: 'awaiting_approval', amount_cents: 10_000 }]);
    expect(summary.awaiting_approval).toBe(1);
  });

  it('held: refreshes the amount owed and creates no transfer', async () => {
    const w = makeWorld({
      amounts: [7_500],
      brake: true,
      rows: [{ status: 'held', amount_cents: 10_000 }],
    });
    await processShow(w.deps(), SHOW, {});
    expect(w.create).not.toHaveBeenCalled();
    expect(w.list).not.toHaveBeenCalled();
    expect(w.rows).toMatchObject([{ status: 'held', amount_cents: 7_500 }]);
  });

  it('brake off: sends through the guarded path, as before', async () => {
    const w = makeWorld({ amounts: [10_000], brake: false });
    await processShow(w.deps(), SHOW, {});
    expect(w.list).toHaveBeenCalledWith({ transfer_group: SHOW.id, limit: 1 });
    expect(w.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 10_000,
        destination: 'acct_club',
        transfer_group: SHOW.id,
      }),
      { idempotencyKey: 'show-payout-row-row-1' }
    );
    expect(w.rows).toMatchObject([{ status: 'completed', stripe_transfer_id: 'tr_1' }]);
  });

  it('approved: sends once, and a second run (or a run at the same time) pays nothing more', async () => {
    const w = makeWorld({ amounts: [9_000], brake: true, rows: [APPROVED] });
    await Promise.all([processShow(w.deps(), SHOW, {}), processShow(w.deps(), SHOW, {})]);
    await processShow(w.deps(), SHOW, {});
    expect(w.create).toHaveBeenCalledTimes(1);
    expect(w.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 9_000, destination: 'acct_club' }),
      expect.anything()
    );
    expect(w.rows).toMatchObject([{ status: 'completed', amount_cents: 9_000 }]);
  });

  it('approved, but the amount rose since approval: no transfer, back for approval', async () => {
    const w = makeWorld({ amounts: [12_000], brake: true, rows: [APPROVED] });
    await processShow(w.deps(), SHOW, {});
    expect(w.create).not.toHaveBeenCalled();
    expect(w.rows).toMatchObject([{ status: 'awaiting_approval', amount_cents: 12_000 }]);
    expect(w.events).toEqual(['reopened: the amount rose from $100.00 to $120.00 since approval']);
    expect(w.alert).toHaveBeenCalledWith(
      'Payout needs approving again: Fall Trial',
      expect.any(String),
      expect.objectContaining({ severity: 'warn' })
    );
  });

  it('approved, but the amount rose between routing and the claim: no transfer, back for approval', async () => {
    const w = makeWorld({ amounts: [10_000, 11_000], brake: true, rows: [APPROVED] });
    await processShow(w.deps(), SHOW, {});
    expect(w.create).not.toHaveBeenCalled();
    expect(w.rows).toMatchObject([{ status: 'awaiting_approval', amount_cents: 11_000 }]);
  });

  it('approved, but the destination account changed: no transfer, back for approval', async () => {
    const w = makeWorld({
      amounts: [10_000],
      brake: true,
      rows: [APPROVED],
      accounts: [{ ...ACCOUNT, stripe_account_id: 'acct_new' }],
    });
    await processShow(w.deps(), SHOW, {});
    expect(w.create).not.toHaveBeenCalled();
    expect(w.rows[0].status).toBe('awaiting_approval');
    expect(w.events[0]).toContain('destination account changed from acct_club to acct_new');
  });

  it('a brake switched on mid-run stops a transfer the run had decided to send', async () => {
    const w = makeWorld({ amounts: [10_000], brake: false });
    w.settings.brake = true; // switched on after the run read it
    const summary: Record<string, number> = {};
    await processShow(w.deps(false), SHOW, summary);
    expect(w.create).not.toHaveBeenCalled();
    expect(w.rows).toEqual([]);
    expect(summary.claim_refused).toBe(1);
  });

  it('a failed attempt whose transfer actually went out is recorded, not queued for approval', async () => {
    const w = makeWorld({
      amounts: [10_000],
      brake: true,
      rows: [{ status: 'failed', amount_cents: 10_000, failure_reason: 'Request timed out' }],
      transfersAlreadyMade: [{ id: 'tr_lost', amount: 10_000 }],
    });
    await processShow(w.deps(), SHOW, {});
    expect(w.create).not.toHaveBeenCalled();
    expect(w.rows.filter(r => r.status !== 'failed')).toMatchObject([
      { status: 'completed', stripe_transfer_id: 'tr_lost', amount_cents: 10_000 },
    ]);
  });

  it('a self-healing retry of an approved attempt sends without a second approval', async () => {
    const w = makeWorld({
      amounts: [10_000],
      brake: true,
      rows: [{ ...APPROVED, status: 'failed', failure_reason: 'insufficient_balance: low' }],
    });
    await processShow(w.deps(), SHOW, {});
    expect(w.create).toHaveBeenCalledTimes(1);
  });

  it('a retry after any other failure of an approved attempt waits for approval again', async () => {
    const w = makeWorld({
      amounts: [10_000],
      brake: true,
      rows: [{ ...APPROVED, status: 'failed', failure_reason: 'account_closed' }],
    });
    await processShow(w.deps(), SHOW, {});
    expect(w.create).not.toHaveBeenCalled();
    expect(w.rows.find(r => r.status !== 'failed')?.status).toBe('awaiting_approval');
  });

  it('reports a payout it could not queue, instead of counting the run clean', async () => {
    const w = makeWorld({ amounts: [10_000], brake: true, failQueueWrites: true });
    const summary: Record<string, number> = {};
    await processShow(w.deps(), SHOW, summary);
    expect(w.create).not.toHaveBeenCalled();
    expect(summary.approval_queue_errors).toBe(1);
    expect(w.alert).toHaveBeenCalledWith(
      'Payout could not be queued for approval: Fall Trial',
      expect.any(String),
      expect.objectContaining({ severity: 'error' })
    );
  });
});
