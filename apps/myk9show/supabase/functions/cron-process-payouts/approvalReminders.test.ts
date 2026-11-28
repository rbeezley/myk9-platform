// MYK9-2182: the payout run's daily reminder for each payout waiting for
// approval. The fake store below answers the way the SQL filters do (status
// awaiting_approval, last reminded before the cutoff or never, keyset by id), so
// "once a day" is tested as behavior across runs, not as a query string. The
// query itself is pinned in approvalReminderStore.test.ts; the resolve on every
// route out of waiting is SQL (supabase/tests/myk9_2182_payout_approval_reminders_test.sql).
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { RunAlertAdminResult } from '../_shared/alertAdminCore';
import type { PayoutAlertOptions } from './payoutTypes';
import {
  awaitingApprovalAlert,
  awaitingApprovalDedupeKey,
  remindAwaitingApprovals,
  reportReminderFailures,
  type ReminderAlertResult,
  type ReminderDeps,
  type WaitingPayout,
} from './approvalReminders';

const HOUR = 3600 * 1000;
const NOW = Date.parse('2026-11-25T08:00:00.000Z');

interface Row extends WaitingPayout {
  status: string;
}

function payout(n: number, extra: Partial<Row> = {}): Row {
  const id = `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
  return {
    id,
    showId: `show-${n}`,
    showName: `Show ${n}`,
    amountCents: 10000 + n,
    remindedAt: null,
    status: 'awaiting_approval',
    ...extra,
  };
}

const OK: ReminderAlertResult = {
  insertOutcome: 'inserted',
  emailAttempted: true,
  emailError: null,
  emailSent: true,
};

/** (approval_reminded_at ASC NULLS FIRST, id ASC). */
function reminderOrder(
  a: Pick<WaitingPayout, 'remindedAt' | 'id'>,
  b: Pick<WaitingPayout, 'remindedAt' | 'id'>
): number {
  const ka = [a.remindedAt === null ? 0 : 1, a.remindedAt ?? '', a.id].join('|');
  const kb = [b.remindedAt === null ? 0 : 1, b.remindedAt ?? '', b.id].join('|');
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}

function world(rows: Row[], alertResult: (p: string) => ReminderAlertResult = () => OK) {
  const lists: Array<Parameters<ReminderDeps['listDue']>[0]> = [];
  const alerts: Array<{ subject: string; html: string; dedupeKey: string; severity: string }> = [];
  const due = (row: Row, cutoffIso: string) =>
    row.status === 'awaiting_approval' && (row.remindedAt === null || row.remindedAt < cutoffIso);
  const deps: ReminderDeps = {
    listDue: async input => {
      lists.push(input);
      return (
        rows
          .filter(row => due(row, input.cutoffIso))
          // Least recently reminded first (never reminded before any), then id;
          // strictly after the cursor, as the store's keyset reads.
          .filter(row => !input.after || reminderOrder(row, input.after) > 0)
          .sort(reminderOrder)
          .slice(0, input.limit)
          .map(row => ({ ...row }))
      );
    },
    claim: async (listed, input) => {
      const row = rows.find(r => r.id === listed.id);
      if (!row || !due(row, input.cutoffIso)) return 'gone';
      row.remindedAt = input.stampIso;
      return 'claimed';
    },
    release: async (listed, stampIso) => {
      const row = rows.find(r => r.id === listed.id);
      if (row && row.remindedAt === stampIso) row.remindedAt = listed.remindedAt;
      return true;
    },
    alertAdmin: async (subject, html, opts) => {
      alerts.push({ subject, html, ...opts });
      return alertResult(opts.dedupeKey);
    },
    siteUrl: 'https://myk9show.com',
  };
  return { deps, lists, alerts, rows };
}

describe('remindAwaitingApprovals: once a day', () => {
  it('reminds each waiting payout once, and not again on a second run the same day', async () => {
    const w = world([payout(1), payout(2)]);
    const first = await remindAwaitingApprovals(w.deps, NOW);
    expect(first).toEqual({ reminded: 2, failed: 0, listFailed: false, deferred: false });
    expect(w.alerts.map(a => a.dedupeKey)).toEqual([
      awaitingApprovalDedupeKey(w.rows[0].id),
      awaitingApprovalDedupeKey(w.rows[1].id),
    ]);

    const rerun = await remindAwaitingApprovals(w.deps, NOW + 2 * HOUR);
    expect(rerun.reminded).toBe(0);
    expect(w.alerts).toHaveLength(2);

    const nextDay = await remindAwaitingApprovals(w.deps, NOW + 24 * HOUR);
    expect(nextDay.reminded).toBe(2);
    expect(w.alerts).toHaveLength(4);
  });

  it('asks for payouts last reminded more than 20 hours ago', async () => {
    const w = world([]);
    await remindAwaitingApprovals(w.deps, NOW);
    expect(w.lists[0].cutoffIso).toBe('2026-11-24T12:00:00.000Z');
  });

  it('does not remind a payout that left waiting between the list and the claim', async () => {
    const w = world([payout(1), payout(2)]);
    const listDue = w.deps.listDue;
    w.deps.listDue = async input => {
      const listed = await listDue(input);
      w.rows[0].status = 'approved';
      return listed;
    };
    const outcome = await remindAwaitingApprovals(w.deps, NOW);
    expect(outcome.reminded).toBe(1);
    expect(w.alerts.map(a => a.dedupeKey)).toEqual([awaitingApprovalDedupeKey(w.rows[1].id)]);
  });

  it('treats a payout approved between the claim and the alert as nothing to send (MYK9-2456)', async () => {
    const rows = [payout(1), payout(2)];
    const stored: ReminderAlertResult = {
      insertOutcome: 'inserted',
      emailAttempted: false,
      emailError: null,
      emailSent: false,
      storedResolved: true,
    };
    const w = world(rows, key => (key === awaitingApprovalDedupeKey(rows[0].id) ? stored : OK));
    const release = vi.fn(w.deps.release);
    w.deps.release = release;

    const outcome = await remindAwaitingApprovals(w.deps, NOW);

    expect(outcome).toEqual({ reminded: 1, failed: 0, listFailed: false, deferred: false });
    expect(release).not.toHaveBeenCalled();
    expect(rows.map(r => r.remindedAt)).toEqual([
      new Date(NOW).toISOString(),
      new Date(NOW).toISOString(),
    ]);
  });

  it('raises the reminder as a warn alert under the payout-scoped key', async () => {
    const w = world([payout(7)]);
    await remindAwaitingApprovals(w.deps, NOW);
    expect(w.alerts[0]).toMatchObject({
      dedupeKey: 'payout-awaiting-approval-00000000-0000-0000-0000-000000000007',
      severity: 'warn',
    });
  });
});

describe('remindAwaitingApprovals: bounded batches', () => {
  it('reads due payouts in batches, each after the last one of the batch before', async () => {
    const rows = Array.from({ length: 7 }, (_, i) => payout(i + 1));
    const w = world(rows);
    const outcome = await remindAwaitingApprovals(w.deps, NOW, { batchSize: 3, maxBatches: 10 });
    expect(outcome).toEqual({ reminded: 7, failed: 0, listFailed: false, deferred: false });
    expect(w.lists.map(l => [l.after, l.limit])).toEqual([
      [null, 3],
      [{ remindedAt: null, id: rows[2].id }, 3],
      [{ remindedAt: null, id: rows[5].id }, 3],
    ]);
  });

  it('reminds next day the payouts a capped run skipped, before the ones it reached', async () => {
    const rows = Array.from({ length: 7 }, (_, i) => payout(i + 1));
    const w = world(rows);
    const limits = { batchSize: 2, maxBatches: 2 };
    expect((await remindAwaitingApprovals(w.deps, NOW, limits)).deferred).toBe(true);
    const firstRun = w.alerts.map(a => a.dedupeKey);
    expect(firstRun).toEqual(rows.slice(0, 4).map(r => awaitingApprovalDedupeKey(r.id)));

    const nextDay = await remindAwaitingApprovals(w.deps, NOW + 24 * HOUR, limits);
    expect(nextDay.reminded).toBe(4);
    expect(w.alerts.slice(4).map(a => a.dedupeKey)).toEqual(
      [rows[4], rows[5], rows[6], rows[0]].map(r => awaitingApprovalDedupeKey(r.id))
    );
  });

  it('does not re-read in the same run a payout whose reminder failed', async () => {
    const rows = [payout(1, { remindedAt: '2026-11-20T08:00:00.000Z' }), payout(2), payout(3)];
    const w = world(rows, key =>
      key === awaitingApprovalDedupeKey(rows[1].id) ? { ...OK, emailSent: false } : OK
    );
    const outcome = await remindAwaitingApprovals(w.deps, NOW, { batchSize: 1, maxBatches: 10 });
    expect(outcome).toEqual({ reminded: 2, failed: 1, listFailed: false, deferred: false });
    expect(w.alerts).toHaveLength(3);
  });

  it('stops after the batch limit and leaves the rest due for the next run', async () => {
    const rows = Array.from({ length: 7 }, (_, i) => payout(i + 1));
    const w = world(rows);
    const outcome = await remindAwaitingApprovals(w.deps, NOW, { batchSize: 2, maxBatches: 2 });
    expect(outcome).toEqual({ reminded: 4, failed: 0, listFailed: false, deferred: true });
    expect(rows.filter(r => r.remindedAt === null)).toHaveLength(3);

    const next = await remindAwaitingApprovals(w.deps, NOW + HOUR, { batchSize: 2, maxBatches: 2 });
    expect(next.reminded).toBe(3);
    expect(rows.every(r => r.remindedAt !== null)).toBe(true);
  });
});

describe('remindAwaitingApprovals: failures', () => {
  it('counts a reminder whose alert was not saved or not emailed, and makes it due again', async () => {
    const rows = [payout(1), payout(2), payout(3)];
    const w = world(rows, key => {
      if (key.endsWith('000000000001')) return { ...OK, insertOutcome: 'insert_failed' };
      if (key.endsWith('000000000002'))
        return { ...OK, emailError: new Error('x'), emailSent: false };
      return OK;
    });
    const outcome = await remindAwaitingApprovals(w.deps, NOW);
    expect(outcome).toEqual({ reminded: 1, failed: 2, listFailed: false, deferred: false });
    expect(rows.map(r => r.remindedAt)).toEqual([null, null, new Date(NOW).toISOString()]);
  });

  it('counts a reminder whose email was skipped (no Resend key), and makes it due again', async () => {
    const rows = [payout(1), payout(2)];
    const w = world(rows, key =>
      key.endsWith('000000000001') ? { ...OK, emailError: null, emailSent: false } : OK
    );
    const outcome = await remindAwaitingApprovals(w.deps, NOW);
    expect(outcome).toEqual({ reminded: 1, failed: 1, listFailed: false, deferred: false });
    expect(rows.map(r => r.remindedAt)).toEqual([null, new Date(NOW).toISOString()]);

    const rerun = await remindAwaitingApprovals(w.deps, NOW + 60 * 1000);
    expect(rerun.failed).toBe(1);
    expect(w.alerts.map(a => a.dedupeKey)).toEqual([
      awaitingApprovalDedupeKey(rows[0].id),
      awaitingApprovalDedupeKey(rows[1].id),
      awaitingApprovalDedupeKey(rows[0].id),
    ]);
  });

  it('counts a claim that errors, and raises nothing for it', async () => {
    const w = world([payout(1)]);
    w.deps.claim = async () => 'error';
    const outcome = await remindAwaitingApprovals(w.deps, NOW);
    expect(outcome).toEqual({ reminded: 0, failed: 1, listFailed: false, deferred: false });
    expect(w.alerts).toHaveLength(0);
  });

  it('reports an unreadable list as a failure, not as nothing due', async () => {
    const w = world([payout(1)]);
    w.deps.listDue = async () => null;
    const outcome = await remindAwaitingApprovals(w.deps, NOW);
    expect(outcome).toEqual({ reminded: 0, failed: 0, listFailed: true, deferred: false });
  });

  it('alerts the operator with the count of reminders that could not be sent', async () => {
    const alertAdmin = vi.fn(async () => OK);
    await reportReminderFailures(
      { alertAdmin, siteUrl: 'https://myk9show.com' },
      { reminded: 1, failed: 2, listFailed: false, deferred: false }
    );
    expect(alertAdmin).toHaveBeenCalledWith(
      'Payout approval reminders could not be sent',
      expect.stringContaining('2 reminders for payouts waiting for approval could not be sent'),
      { dedupeKey: 'payout-approval-reminders-failed', severity: 'error' }
    );
  });

  it('alerts when the waiting payouts could not be read', async () => {
    const alertAdmin = vi.fn(async () => OK);
    await reportReminderFailures(
      { alertAdmin, siteUrl: undefined },
      { reminded: 0, failed: 0, listFailed: true, deferred: false }
    );
    expect(alertAdmin).toHaveBeenCalledWith(
      'Payout approval reminders could not be sent',
      expect.stringContaining('could not read which payouts are waiting for approval'),
      { dedupeKey: 'payout-approval-reminders-failed', severity: 'error' }
    );
  });

  it('raises nothing when every reminder went out', async () => {
    const alertAdmin = vi.fn(async () => OK);
    await reportReminderFailures(
      { alertAdmin, siteUrl: undefined },
      { reminded: 3, failed: 0, listFailed: false, deferred: false }
    );
    expect(alertAdmin).not.toHaveBeenCalled();
  });
});

describe('wiring', () => {
  it('takes the alertAdmin wrapper index.ts passes', () => {
    type IndexAlertAdmin = (
      subject: string,
      html: string,
      opts?: PayoutAlertOptions
    ) => Promise<RunAlertAdminResult>;
    expectTypeOf<IndexAlertAdmin>().toMatchTypeOf<ReminderDeps['alertAdmin']>();
  });
});

describe('awaitingApprovalAlert', () => {
  it('escapes the show name in the email body', () => {
    const { html } = awaitingApprovalAlert(
      payout(1, { showName: '<img src=x onerror=alert(1)> & Co' }),
      'https://myk9show.com'
    );
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt; &amp; Co');
    expect(html).not.toContain('<img');
  });

  it('names the amount and links the payouts page, and says nothing about since when', () => {
    const { subject, html } = awaitingApprovalAlert(
      payout(1, { remindedAt: '2026-11-20T08:00:00.000Z' }),
      'https://myk9show.com'
    );
    expect(subject).toBe('Payout waiting for your approval: Show 1');
    expect(html).toContain('$100.01');
    expect(html).toContain('href="https://myk9show.com/admin/payouts"');
    expect(html).not.toMatch(/since/i);
    expect(html).not.toContain('2026-11-20');
  });

  it('names the show by id when the show name is missing', () => {
    const { subject } = awaitingApprovalAlert(payout(1, { showName: null }), undefined);
    expect(subject).toBe('Payout waiting for your approval: show-1');
  });
});
