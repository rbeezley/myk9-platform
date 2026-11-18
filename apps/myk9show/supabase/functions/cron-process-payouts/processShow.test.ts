// MYK9-2170: the payout run's per-show flow with the Stripe transfer calls
// observed. The database is a recording fake: reads answer from the scenario,
// writes are kept for assertions, and claim_show_payout_for_send answers with
// the outcome under test (its own rules are covered by
// supabase/tests/myk9_2170_payout_brake_test.sql).
import { describe, expect, it, vi } from 'vitest';
import { payoutRetryNote, processShow, type ProcessShowDeps } from './processShow';

const SHOW = { id: 'show-1', name: 'Fall Trial', club_id: 'club-1', end_date: '2026-11-01' };
const ACCOUNT = {
  id: 'csa-1',
  stripe_account_id: 'acct_club',
  payouts_enabled: true,
  onboarding_complete: true,
  livemode: false,
};

interface Query {
  table: string;
  op: 'select' | 'insert' | 'update' | 'delete';
  values?: Record<string, unknown>;
  filters: unknown[][];
}

interface Scenario {
  liveRow?: { id: string; status: string } | null;
  /** Payable cents per entries read, in order (the last one repeats). */
  amounts: number[];
  claim?: { data: unknown; error: { message: string } | null };
  transferError?: Error;
  brakeOn?: boolean;
  showName?: string;
}

function run(scenario: Scenario) {
  const amounts = [...scenario.amounts];
  const writes: Query[] = [];
  const respond = (q: Query): { data: unknown; error: null } => {
    if (q.op !== 'select') return { data: null, error: null };
    if (q.table === 'show_payouts') return { data: scenario.liveRow ?? null, error: null };
    if (q.table === 'entries') {
      const cents = amounts.length > 1 ? amounts.shift()! : amounts[0];
      const rows =
        cents > 0
          ? [
              {
                entry_fee: cents / 100,
                payment_method: 'online',
                payment_status: 'paid',
                refund_amount: 0,
              },
            ]
          : [];
      return { data: rows, error: null };
    }
    if (q.table === 'club_stripe_accounts') return { data: [ACCOUNT], error: null };
    if (q.table === 'clubs')
      return { data: { name: 'Club', email: 'club@example.test' }, error: null };
    return { data: null, error: null };
  };

  const from = (table: string) => {
    const q: Query = { table, op: 'select', filters: [] };
    const builder: Record<string, unknown> = {};
    for (const name of [
      'eq',
      'neq',
      'in',
      'lt',
      'order',
      'range',
      'limit',
      'maybeSingle',
      'single',
    ]) {
      builder[name] = (...args: unknown[]) => {
        q.filters.push([name, ...args]);
        return builder;
      };
    }
    builder.select = () => builder;
    builder.insert = (values: Record<string, unknown>) => {
      Object.assign(q, { op: 'insert', values });
      return builder;
    };
    builder.update = (values: Record<string, unknown>) => {
      Object.assign(q, { op: 'update', values });
      return builder;
    };
    builder.delete = () => {
      q.op = 'delete';
      return builder;
    };
    builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
      if (q.op !== 'select') writes.push(q);
      return Promise.resolve(respond(q)).then(resolve, reject);
    };
    return builder;
  };
  const rpc = vi.fn(
    async () => scenario.claim ?? { data: { outcome: 'claimed', payout_id: 'row-1' }, error: null }
  );

  const create = vi.fn(async () => {
    if (scenario.transferError) throw scenario.transferError;
    return { id: 'tr_1' };
  });
  const list = vi.fn(async () => ({ data: [] as Array<{ id: string; amount: number }> }));
  const alertAdmin = vi.fn<ProcessShowDeps['alertAdmin']>(async () => undefined);
  const release = vi.fn(async () => undefined);

  const deps: ProcessShowDeps = {
    supabase: { from, rpc } as unknown as ProcessShowDeps['supabase'],
    stripe: { transfers: { list, create } },
    stripeLivemode: false,
    brakeOn: scenario.brakeOn ?? true,
    alertAdmin,
    clubNoticeDeps: () => ({ loadRecipients: async () => [], send: vi.fn(async () => undefined) }),
    acquireMoneyLock: async () => ({ ok: true, lockId: 'lock-1', release }),
    siteUrl: 'https://example.test',
  };
  const summary: Record<string, number> = {
    completed: 0,
    pending_not_onboarded: 0,
    failed: 0,
    skipped_no_online_money: 0,
    mode_mismatch: 0,
    money_lock_busy: 0,
    awaiting_approval: 0,
    claim_errors: 0,
  };
  return {
    go: () => processShow({ ...SHOW, name: scenario.showName ?? SHOW.name }, summary, deps),
    create,
    rpc,
    alertAdmin,
    writes,
    summary,
  };
}

describe('processShow: an authorized send', () => {
  it('brake off: transfers exactly the recalculated amount to the club, once', async () => {
    const world = run({
      amounts: [12345],
      brakeOn: false,
      claim: { data: { outcome: 'claimed', payout_id: 'row-1' }, error: null },
    });
    await world.go();
    expect(world.create).toHaveBeenCalledTimes(1);
    expect(world.create).toHaveBeenCalledWith(
      {
        amount: 12345,
        currency: 'usd',
        destination: 'acct_club',
        transfer_group: 'show-1',
        metadata: { show_id: 'show-1', show_name: 'Fall Trial' },
      },
      { idempotencyKey: 'show-payout-row-row-1' }
    );
    expect(world.rpc).toHaveBeenCalledWith('claim_show_payout_for_send', {
      p_show_id: 'show-1',
      p_account_id: 'csa-1',
      p_destination: 'acct_club',
      p_amount_cents: 12345,
    });
  });

  it('approved: sends within the approval, after a refund lowered it', async () => {
    const world = run({
      liveRow: { id: 'row-1', status: 'approved' },
      amounts: [10000, 9000],
      claim: {
        data: { outcome: 'claimed', payout_id: 'row-1', approved_amount_cents: 10000 },
        error: null,
      },
    });
    await world.go();
    expect(world.create).toHaveBeenCalledTimes(1);
    expect(world.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 9000, destination: 'acct_club' }),
      { idempotencyKey: 'show-payout-row-row-1' }
    );
  });
});

describe('processShow: nothing sends without approval', () => {
  it.each(['awaiting_approval', 'approval_reset', 'held', 'busy', 'account_mismatch'])(
    'claim outcome %s makes no transfer',
    async outcome => {
      const world = run({
        amounts: [5000],
        claim: { data: { outcome, payout_id: 'row-1' }, error: null },
      });
      await world.go();
      expect(world.create).not.toHaveBeenCalled();
    }
  );

  it('a held row reaches the claim each run, so its amount follows refunds', async () => {
    const world = run({
      liveRow: { id: 'row-1', status: 'held' },
      amounts: [4000],
      claim: { data: { outcome: 'held', payout_id: 'row-1' }, error: null },
    });
    await world.go();
    expect(world.rpc).toHaveBeenCalledWith(
      'claim_show_payout_for_send',
      expect.objectContaining({ p_amount_cents: 4000 })
    );
    expect(world.create).not.toHaveBeenCalled();
  });

  it('a held row fully refunded is closed out, not sent', async () => {
    const world = run({ liveRow: { id: 'row-1', status: 'held' }, amounts: [0] });
    await world.go();
    expect(world.rpc).not.toHaveBeenCalled();
    expect(world.create).not.toHaveBeenCalled();
    const closeOut = world.writes.find(w => w.table === 'show_payouts' && w.op === 'update');
    expect(closeOut?.values).toMatchObject({ amount_cents: 0, status: 'completed' });
    expect(closeOut?.filters).toContainEqual([
      'in',
      'status',
      ['pending', 'awaiting_approval', 'approved', 'held'],
    ]);
  });

  it.each([
    { label: 'an RPC error', claim: { data: null, error: { message: 'function does not exist' } } },
    { label: 'an unreadable answer', claim: { data: { outcome: 'sent' }, error: null } },
  ])('a failed claim ($label) sends nothing and is counted and alerted', async ({ claim }) => {
    const world = run({ amounts: [5000], claim });
    await world.go();
    expect(world.create).not.toHaveBeenCalled();
    expect(world.summary.claim_errors).toBe(1);
    expect(world.alertAdmin).toHaveBeenCalledWith(
      'Payout could not be checked: Fall Trial',
      expect.stringContaining('Nothing was sent'),
      { dedupeKey: 'payout-claim-error-show-1' }
    );
  });

  it('escapes a club-written show name in the operator alert body', async () => {
    const world = run({
      amounts: [5000],
      claim: { data: null, error: { message: 'boom' } },
      showName: '<a href="https://evil.test">Pay here</a>',
    });
    await world.go();
    const body = world.alertAdmin.mock.calls[0]?.[1] as string;
    expect(body).toContain('&lt;a href=');
    expect(body).not.toContain('<a href=');
  });

  it('an amount above the approval after the claim goes back for approval, not to Stripe', async () => {
    const world = run({
      liveRow: { id: 'row-1', status: 'approved' },
      amounts: [10000, 12000],
      claim: {
        data: { outcome: 'claimed', payout_id: 'row-1', approved_amount_cents: 10000 },
        error: null,
      },
    });
    await world.go();
    expect(world.create).not.toHaveBeenCalled();
    const reset = world.writes.find(
      w => w.op === 'update' && w.values?.status === 'awaiting_approval'
    );
    expect(reset?.values).toMatchObject({
      amount_cents: 12000,
      approved_at: null,
      approved_amount_cents: null,
      approved_stripe_account_id: null,
    });
    expect(world.summary.awaiting_approval).toBe(1);
  });
});

describe('failure notices tell the truth in both brake modes', () => {
  it('brake on: a balance delay says it waits for approval again', async () => {
    const world = run({
      amounts: [5000],
      brakeOn: true,
      claim: {
        data: { outcome: 'claimed', payout_id: 'row-1', approved_amount_cents: 5000 },
        error: null,
      },
      transferError: new Error('Insufficient funds: balance_insufficient'),
    });
    await world.go();
    const html = world.alertAdmin.mock.calls[0]?.[1] as string;
    expect(html).toContain('waits for approval again');
    expect(html).not.toContain('retries automatically');
  });

  it('brake off keeps the automatic-retry wording', () => {
    expect(payoutRetryNote('balance_delay', false)).toContain('retries automatically');
    expect(payoutRetryNote('transfer_failed', false)).toContain('will retry tomorrow');
    expect(payoutRetryNote('stale_processing', false)).toContain('No action needed');
  });

  it.each(['balance_delay', 'transfer_failed', 'stale_processing'] as const)(
    '%s: brake on promises no automatic send, and no copy uses an em dash',
    kind => {
      expect(payoutRetryNote(kind, true)).toContain('waits for approval again');
      expect(payoutRetryNote(kind, true)).not.toContain('retries automatically');
      expect(payoutRetryNote(kind, true)).not.toContain('—');
      expect(payoutRetryNote(kind, false)).not.toContain('—');
    }
  );
});
