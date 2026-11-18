// Test harness for the payout run (MYK9-2170, MYK9-2183): a recording fake
// database plus observed Stripe transfer calls. Reads answer from the
// scenario, writes are kept for assertions, and claim_show_payout_for_send
// answers with the outcome under test (its own rules are covered by
// supabase/tests/myk9_2170_payout_brake_test.sql). Not a test file itself.
import { vi } from 'vitest';
import { processShow, type ProcessShowDeps } from './processShow';
import { recoverStaleProcessing } from './payoutReconcile';

export const SHOW = { id: 'show-1', name: 'Fall Trial', club_id: 'club-1', end_date: '2026-11-01' };
export const ACCOUNT = {
  id: 'csa-1',
  stripe_account_id: 'acct_club',
  payouts_enabled: true,
  onboarding_complete: true,
  livemode: false,
};

export interface Query {
  table: string;
  op: 'select' | 'insert' | 'update' | 'delete';
  values?: Record<string, unknown>;
  filters: unknown[][];
  /** An update/insert asked for the written rows back. */
  returning?: boolean;
}

export interface StripeTransferRow {
  id: string;
  amount: number;
  destination: string | null;
  reversed?: boolean;
  amount_reversed?: number;
}

export interface Scenario {
  liveRow?: { id: string; status: string } | null;
  /** The show's newest payout row of any status (the failed-attempt check). */
  latestRow?: { id: string; status: string } | null;
  /** Rows the stale-processing check finds. */
  staleRows?: Array<Record<string, unknown>>;
  /** Payable cents per entries read, in order (the last one repeats). */
  amounts: number[];
  claim?: { data: unknown; error: { message: string } | null };
  transferError?: Error;
  /** What Stripe already has for the show's transfer_group. */
  transfers?: StripeTransferRow[];
  listError?: Error;
  /** Stripe says more transfers exist past the listed page. */
  transfersHasMore?: boolean;
  /** The club email after a send throws. */
  clubEmailError?: Error;
  /** A database write this returns true for fails. */
  failWrite?: (q: Query) => boolean;
  /** A database write this returns true for throws (a dropped connection). */
  throwWrite?: (q: Query) => boolean;
  brakeOn?: boolean;
  showName?: string;
  /** The club's Stripe account can receive money (default true). */
  payoutsEnabled?: boolean;
}

const hasFilter = (q: Query, name: string, column: string) =>
  q.filters.some(f => f[0] === name && f[1] === column);

export function run(scenario: Scenario) {
  const amounts = [...scenario.amounts];
  const writes: Query[] = [];
  const respond = (q: Query): { data: unknown; error: { message: string } | null } => {
    if (q.op !== 'select') {
      if (scenario.failWrite?.(q)) return { data: null, error: { message: 'db write refused' } };
      return { data: q.returning ? [{ id: 'written' }] : null, error: null };
    }
    if (q.table === 'show_payouts') {
      if (hasFilter(q, 'lt', 'updated_at')) return { data: scenario.staleRows ?? [], error: null };
      if (hasFilter(q, 'order', 'created_at')) {
        return { data: scenario.latestRow ?? null, error: null };
      }
      return { data: scenario.liveRow ?? null, error: null };
    }
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
    if (q.table === 'club_stripe_accounts') {
      const byStripeId = q.filters.find(f => f[0] === 'eq' && f[1] === 'stripe_account_id');
      if (byStripeId) {
        return {
          data: [ACCOUNT]
            .filter(a => a.stripe_account_id === byStripeId[2])
            .map(a => ({ id: a.id, club_id: SHOW.club_id })),
          error: null,
        };
      }
      return {
        data: [{ ...ACCOUNT, payouts_enabled: scenario.payoutsEnabled ?? true }],
        error: null,
      };
    }
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
    builder.select = () => {
      if (q.op !== 'select') q.returning = true;
      return builder;
    };
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
      if (q.op !== 'select' && scenario.throwWrite?.(q)) {
        return Promise.reject(new Error('connection reset')).then(resolve, reject);
      }
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
  const list = vi.fn<ProcessShowDeps['stripe']['transfers']['list']>(async () => {
    if (scenario.listError) throw scenario.listError;
    return { data: scenario.transfers ?? [], has_more: scenario.transfersHasMore ?? false };
  });
  const alertAdmin = vi.fn<ProcessShowDeps['alertAdmin']>(async () => undefined);
  const release = vi.fn(async () => undefined);
  const acquireMoneyLock = vi.fn<ProcessShowDeps['acquireMoneyLock']>(async () => ({
    ok: true,
    lockId: 'lock-1',
    release,
  }));

  const deps: ProcessShowDeps = {
    supabase: { from, rpc } as unknown as ProcessShowDeps['supabase'],
    stripe: { transfers: { list, create } },
    stripeLivemode: false,
    brakeOn: scenario.brakeOn ?? true,
    alertAdmin,
    clubNoticeDeps: () => ({
      loadRecipients: async () => {
        if (scenario.clubEmailError) throw scenario.clubEmailError;
        return [];
      },
      send: vi.fn(async () => undefined),
    }),
    acquireMoneyLock,
    siteUrl: 'https://example.test',
  };
  const summary: Record<string, number> = {
    completed: 0,
    pending_not_onboarded: 0,
    failed: 0,
    skipped_no_online_money: 0,
    stale_recovered: 0,
    mode_mismatch: 0,
    money_lock_busy: 0,
    awaiting_approval: 0,
    claim_errors: 0,
    uncertain_transfers: 0,
    reconciled: 0,
    transfer_lookup_errors: 0,
    reconciliation_errors: 0,
    ledger_write_errors: 0,
  };
  const payoutWrites = () => writes.filter(w => w.table === 'show_payouts');
  return {
    go: () => processShow({ ...SHOW, name: scenario.showName ?? SHOW.name }, summary, deps),
    recoverStale: () => recoverStaleProcessing(deps, summary, '2026-11-17T00:00:00.000Z'),
    create,
    list,
    rpc,
    alertAdmin,
    acquireMoneyLock,
    release,
    writes,
    payoutWrites,
    summary,
  };
}
