// @vitest-environment node
// MYK9-2088: a confirmation survives a run that stops after the claim or after the provider
// accepted it, and the next scheduled run finishes it with exactly one delivery.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CONFIRMATION_LEASE_MS,
  CONFIRMATION_MAX_FAILED_ATTEMPTS,
  CONFIRMATION_RETRY_DELAYS_MS,
} from './entryConfirmationJobs';
import { runEntryConfirmations } from './entryConfirmationRun';
import {
  DAY,
  entry,
  makeDeps,
  resetEntrySeq,
  show,
  type FakeDepsArgs,
} from './entryConfirmationRun.testUtils';
import type { AcceptanceHistoryRow } from './entryConfirmations';

const MINUTE = 60 * 1000;

beforeEach(() => {
  resetEntrySeq();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

function setup(overrides: Partial<FakeDepsArgs> = {}) {
  const entries = [entry()];
  const fixture = makeDeps({ shows: [show()], entries, ...overrides });
  return { ...fixture, entries };
}

/** Makes the named store step throw once, as a run that was killed there would never finish it. */
function stopOnce<T extends object>(target: T, method: keyof T & string) {
  const original = target[method] as unknown as (...args: unknown[]) => Promise<unknown>;
  let stopped = false;
  (target as Record<string, unknown>)[method] = async (...args: unknown[]) => {
    if (!stopped) {
      stopped = true;
      throw new Error(`stopped in ${method}`);
    }
    return original(...args);
  };
}

describe('a run stopped after the claim', () => {
  it('is recovered by the next scheduled run: one delivery, one log row, entries marked', async () => {
    const { deps, sends, deliveries, logs, entries, jobRows, advance } = setup();
    // The job is claimed (leased) and the run stops before it sends anything.
    stopOnce(deps.jobs, 'loadAttempts');

    expect(await runEntryConfirmations(deps, 'new')).toMatchObject({
      sent: 0,
      failed: 0,
      errors: 1,
    });
    expect(sends).toHaveLength(0);
    expect(jobRows).toHaveLength(1);
    expect(jobRows[0]).toMatchObject({ status: 'ready', attempt_id: expect.any(String) });
    // The old design stamped the entry here and never emailed her. Now nothing is stamped.
    expect(entries[0]).toMatchObject({
      confirmation_email_sent_at: null,
      confirmation_email_status: 'pending',
    });

    // While the lease is live, a second run neither takes the job nor writes another.
    advance(5 * MINUTE);
    await runEntryConfirmations(deps, 'new');
    expect(sends).toHaveLength(0);
    expect(jobRows).toHaveLength(1);

    // The lease runs out; the next scheduled run sends it.
    advance(CONFIRMATION_LEASE_MS);
    expect(await runEntryConfirmations(deps, 'new')).toMatchObject({ sent: 1, errors: 0 });
    expect(sends).toHaveLength(1);
    expect(deliveries.size).toBe(1);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ status: 'sent', related_id: entries[0]!.id });
    expect(jobRows[0]).toMatchObject({ status: 'sent', attempt_id: null, claimed_until: null });
    expect(entries[0]).toMatchObject({ confirmation_email_status: 'sent' });
    expect(entries[0]!.confirmation_email_sent_at).not.toBeNull();

    // And nothing more, however often the schedule fires.
    advance(DAY);
    await runEntryConfirmations(deps, 'all');
    expect(sends).toHaveLength(1);
  });
});

describe('a run stopped after the provider accepted', () => {
  it('before the attempt was recorded: the retry reuses the key, so the provider delivers once', async () => {
    const { deps, sends, deliveries, logs, entries, advance } = setup();
    stopOnce(deps.jobs, 'recordAttempt');

    await runEntryConfirmations(deps, 'new');
    expect(sends).toHaveLength(1);
    expect(deliveries.size).toBe(1);
    expect(entries[0]!.confirmation_email_sent_at).toBeNull();

    advance(CONFIRMATION_LEASE_MS + MINUTE);
    expect(await runEntryConfirmations(deps, 'new')).toMatchObject({ sent: 1 });
    // The second call carries the first call's Idempotency-Key: the provider answers with the
    // first message and delivers nothing new.
    expect(sends).toHaveLength(2);
    expect(sends[1]!.idempotencyKey).toBe(sends[0]!.idempotencyKey);
    expect(deliveries.size).toBe(1);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ resend_message_id: [...deliveries.values()][0] });
    expect(entries[0]).toMatchObject({ confirmation_email_status: 'sent' });
  });

  it('after the attempt was recorded, before the log: reconciled with no second send', async () => {
    const { deps, sends, logs, entries, jobRows, advance } = setup();
    stopOnce(deps, 'log');

    await runEntryConfirmations(deps, 'new');
    expect(sends).toHaveLength(1);
    expect(logs).toHaveLength(0);

    advance(CONFIRMATION_LEASE_MS + MINUTE);
    expect(await runEntryConfirmations(deps, 'new')).toMatchObject({ sent: 0, reconciled: 1 });
    expect(sends).toHaveLength(1);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ status: 'sent', resend_message_id: 'msg-1' });
    expect(jobRows[0]).toMatchObject({ status: 'sent', email_log_id: 'log-1' });
    expect(entries[0]).toMatchObject({
      confirmation_email_status: 'sent',
      confirmation_email_message_id: 'msg-1',
    });
  });

  it('after the log, before the entries were marked: reconciled, one log row, no second send', async () => {
    const { deps, sends, logs, entries, jobRows, advance } = setup();
    stopOnce(deps, 'markSent');

    await runEntryConfirmations(deps, 'new');
    expect(sends).toHaveLength(1);
    expect(logs).toHaveLength(1);
    expect(entries[0]!.confirmation_email_sent_at).toBeNull();

    advance(CONFIRMATION_LEASE_MS + MINUTE);
    expect(await runEntryConfirmations(deps, 'new')).toMatchObject({ sent: 0, reconciled: 1 });
    expect(sends).toHaveLength(1);
    expect(logs).toHaveLength(1);
    expect(jobRows[0]).toMatchObject({ status: 'sent', email_log_id: 'log-1' });
    expect(entries[0]).toMatchObject({ confirmation_email_status: 'sent' });
    expect(entries[0]!.confirmation_email_sent_at).not.toBeNull();
  });

  it('after the job was sent, before the entries were marked: the entries are marked without a send', async () => {
    const { deps, sends, entries, jobRows, advance } = setup();
    // The job ends sent while the write to the entries never landed (the marker lags the job).
    let marked = false;
    const markSent = deps.markSent;
    deps.markSent = async (...args) => {
      if (!marked) {
        marked = true;
        return; // the write never reached the entries
      }
      return markSent(...args);
    };
    await runEntryConfirmations(deps, 'new');
    expect(jobRows[0]!.status).toBe('sent');
    expect(entries[0]!.confirmation_email_sent_at).toBeNull();

    advance(DAY);
    await runEntryConfirmations(deps, 'all');
    expect(sends).toHaveLength(1);
    expect(entries[0]).toMatchObject({ confirmation_email_status: 'sent' });
    expect(entries[0]!.confirmation_email_sent_at).not.toBeNull();
  });
});

describe('overlapping runs', () => {
  it('cannot both send: the second finds the first one leased, or the job already written', async () => {
    const { deps, sends, deliveries, jobRows } = setup();
    // Both runs read the same candidates before either writes; the slower one gets 'open'.
    const [first, second] = await Promise.all([
      runEntryConfirmations(deps, 'new'),
      runEntryConfirmations(deps, 'new'),
    ]);
    expect(first.sent + second.sent).toBe(1);
    expect(sends).toHaveLength(1);
    expect(deliveries.size).toBe(1);
    expect(jobRows).toHaveLength(1);
  });
});

describe('refusals', () => {
  it('end at failed after the fifth, mark the entries failed, and the daily run revives the job', async () => {
    let refuse = true;
    const { deps, sends, logs, entries, jobRows, attempts, advance } = setup({
      sendResult: () =>
        refuse ? { ok: false, error: 'provider_http_500' } : { ok: true, messageId: 'msg-ok' },
    });

    for (let i = 0; i < CONFIRMATION_MAX_FAILED_ATTEMPTS; i++) {
      await runEntryConfirmations(deps, 'new');
      advance((CONFIRMATION_RETRY_DELAYS_MS[i] ?? CONFIRMATION_RETRY_DELAYS_MS.at(-1)!) + MINUTE);
    }
    expect(sends).toHaveLength(CONFIRMATION_MAX_FAILED_ATTEMPTS);
    expect(jobRows[0]!.status).toBe('failed');
    expect(entries[0]).toMatchObject({
      confirmation_email_sent_at: null,
      confirmation_email_status: 'failed',
    });
    // Delivery history reads the failed job and its refused attempts, not a log row per try.
    expect(logs).toHaveLength(0);
    expect(attempts.filter(attempt => attempt.status === 'failed')).toHaveLength(
      CONFIRMATION_MAX_FAILED_ATTEMPTS
    );

    // The frequent run leaves it; the daily run revives it, and the provider is back.
    await runEntryConfirmations(deps, 'new');
    expect(sends).toHaveLength(CONFIRMATION_MAX_FAILED_ATTEMPTS);
    refuse = false;
    advance(DAY);
    expect(await runEntryConfirmations(deps, 'all')).toMatchObject({ sent: 1 });
    expect(sends).toHaveLength(CONFIRMATION_MAX_FAILED_ATTEMPTS + 1);
    expect(sends.at(-1)!.idempotencyKey).toBe(sends[0]!.idempotencyKey);
    expect(entries[0]).toMatchObject({ confirmation_email_status: 'sent' });
    expect(jobRows).toHaveLength(1);
    expect(jobRows[0]!.status).toBe('sent');
  });
});

describe('what the entries are now (re-acceptance and genuine prior sends)', () => {
  it('never touches an entry whose confirmation already went out', async () => {
    const sentBefore = entry({
      confirmation_email_sent_at: '2026-11-10T09:00:00Z',
      confirmation_email_status: 'sent',
      confirmation_email_message_id: 'msg-historic',
    });
    const { deps, sends, jobRows } = makeDeps({ shows: [show()], entries: [sentBefore] });
    await runEntryConfirmations(deps, 'all');
    expect(sends).toHaveLength(0);
    expect(jobRows).toHaveLength(0);
    expect(sentBefore).toMatchObject({
      confirmation_email_sent_at: '2026-11-10T09:00:00Z',
      confirmation_email_message_id: 'msg-historic',
    });
  });

  it('skips a waiting job whose entry was returned to review and accepted again, and sends the new acceptance once', async () => {
    const accepted = entry();
    const history: AcceptanceHistoryRow[] = [
      { id: 'hist-1', entry_id: accepted.id, changed_at: '2026-11-20T13:00:00Z' },
    ];
    const { deps, sends, jobRows, advance } = makeDeps({
      shows: [show()],
      entries: [accepted],
      history,
    });
    stopOnce(deps.jobs, 'loadAttempts'); // the first job is written and leased, never sent

    await runEntryConfirmations(deps, 'new');
    expect(sends).toHaveLength(0);
    expect(jobRows).toHaveLength(1);

    // Back to review and accepted again: the trigger resets the markers, history gains a row.
    history.push({ id: 'hist-2', entry_id: accepted.id, changed_at: '2026-11-20T14:30:00Z' });
    advance(CONFIRMATION_LEASE_MS + MINUTE);
    accepted.updated_at = '2026-11-20T14:30:00Z';
    await runEntryConfirmations(deps, 'new');

    expect(jobRows.map(row => row.status).sort()).toEqual(['sent', 'skipped']);
    expect(sends).toHaveLength(1);
    expect(sends[0]!.idempotencyKey).toBe(
      jobRows.find(row => row.status === 'sent')!.idempotency_key
    );
    expect(sends[0]!.idempotencyKey).not.toBe(
      jobRows.find(row => row.status === 'skipped')!.idempotency_key
    );

    // A third acceptance after the second went out is a new confirmation again.
    accepted.confirmation_email_sent_at = null;
    accepted.confirmation_email_status = 'pending';
    accepted.updated_at = '2026-11-20T14:31:00Z';
    history.push({ id: 'hist-3', entry_id: accepted.id, changed_at: '2026-11-20T14:31:00Z' });
    advance(DAY);
    await runEntryConfirmations(deps, 'new');
    expect(sends).toHaveLength(2);
    expect(new Set(sends.map(email => email.idempotencyKey)).size).toBe(2);
  });

  it('skips a job whose show switched the acceptance email off, and sends it once switched back on', async () => {
    const { deps, sends, jobRows, advance, entries } = setup();
    stopOnce(deps.jobs, 'loadAttempts');
    await runEntryConfirmations(deps, 'new');
    expect(jobRows).toHaveLength(1);

    const switchedOff = vi
      .spyOn(deps, 'loadAcceptedEmailOff')
      .mockResolvedValue(new Set(['show-1']));
    advance(CONFIRMATION_LEASE_MS + MINUTE);
    expect(await runEntryConfirmations(deps, 'new')).toMatchObject({ sent: 0, skipped: 1 });
    expect(jobRows[0]!.status).toBe('skipped');
    expect(sends).toHaveLength(0);
    expect(entries[0]).toMatchObject({ confirmation_email_status: 'pending' });

    switchedOff.mockRestore();
    advance(MINUTE);
    expect(await runEntryConfirmations(deps, 'new')).toMatchObject({ sent: 1 });
    expect(sends).toHaveLength(1);
    expect(jobRows).toHaveLength(1);
  });
});
