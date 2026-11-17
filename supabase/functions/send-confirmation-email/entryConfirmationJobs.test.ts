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
  LONG_AGO,
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
    stopOnce(deps.jobs, 'resolveAttempt'); // the provider accepted; the answer is never recorded

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
  it('end at failed after the fifth, mark the entries failed, and the daily run writes a new ticket', async () => {
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
    // The failed ticket stays as the record; the daily run wrote a new one for the same group.
    expect(jobRows.map(row => row.status)).toEqual(['failed', 'sent']);
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

  it('holds a waiting ticket while a re-accepted entry is quiet, then sends the new acceptance under its own key', async () => {
    const accepted = entry();
    const history: AcceptanceHistoryRow[] = [
      { id: 'hist-1', entry_id: accepted.id, changed_at: '2026-11-20T13:00:00Z' },
    ];
    const { deps, sends, jobRows, advance } = makeDeps({
      shows: [show()],
      entries: [accepted],
      history,
    });
    stopOnce(deps.jobs, 'loadAttempts'); // the ticket is written and leased, never sent

    await runEntryConfirmations(deps, 'new');
    expect(sends).toHaveLength(0);
    expect(jobRows).toHaveLength(1);

    // Back to review and accepted again: the trigger resets the markers and bumps updated_at,
    // history gains a row. The change is recent, so the quiet period holds the email back.
    advance(CONFIRMATION_LEASE_MS + MINUTE);
    history.push({ id: 'hist-2', entry_id: accepted.id, changed_at: '2026-11-20T15:05:00Z' });
    accepted.updated_at = '2026-11-20T15:11:00Z';
    expect(await runEntryConfirmations(deps, 'new')).toMatchObject({ sent: 0, deferred: 1 });
    expect(sends).toHaveLength(0);
    expect(jobRows[0]!.status).toBe('ready');

    advance(15 * MINUTE);
    expect(await runEntryConfirmations(deps, 'new')).toMatchObject({ sent: 1 });
    expect(sends).toHaveLength(1);
    expect(jobRows).toHaveLength(1);

    // A third acceptance after that went out is a new confirmation again, under another key.
    accepted.confirmation_email_sent_at = null;
    accepted.confirmation_email_status = 'pending';
    accepted.updated_at = '2026-11-20T14:31:00Z';
    history.push({ id: 'hist-3', entry_id: accepted.id, changed_at: '2026-11-20T16:00:00Z' });
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
    expect(jobRows.map(row => row.status)).toEqual(['skipped', 'sent']);
  });
});

describe('the email is worked out when it is sent (not when the job was written)', () => {
  it('sends the current venue to the current address, under a key for that address', async () => {
    const people = { 'reg-ada': { email: 'ada@example.com', firstName: 'Ada', lastName: 'L' } };
    const venue = show();
    const { deps, sends, jobRows, advance } = setup({ shows: [venue], people });
    stopOnce(deps.jobs, 'loadAttempts'); // the job is written and leased, never sent

    await runEntryConfirmations(deps, 'new');
    expect(sends).toHaveLength(0);
    // Nothing is stored on the ticket: no body, no entry set.
    expect(Object.keys(jobRows[0]!)).not.toContain('html');

    venue.address = '77 New Venue Lane';
    people['reg-ada'] = { email: 'ada.new@example.com', firstName: 'Ada', lastName: 'L' };
    advance(CONFIRMATION_LEASE_MS + MINUTE);
    expect(await runEntryConfirmations(deps, 'new')).toMatchObject({ sent: 1 });

    expect(sends).toHaveLength(1);
    expect(sends[0]!.to).toBe('ada.new@example.com');
    expect(sends[0]!.html).toContain('77 New Venue Lane');
    expect(sends[0]!.html).not.toContain('1200 Fairgrounds Rd');
    expect(sends[0]!.idempotencyKey).toMatch(/^entry-confirmation:[0-9a-f]+:[0-9a-f]{12}$/);
  });

  it('ends the ticket failed with a visible missing_recipient attempt when the address is gone, once', async () => {
    const people: Record<string, { email: string | null; firstName: string; lastName: null }> = {
      'reg-ada': { email: 'ada@example.com', firstName: 'Ada', lastName: null },
    };
    const { deps, sends, jobRows, attempts, logs, entries, advance } = setup({ people });
    stopOnce(deps.jobs, 'loadAttempts');
    await runEntryConfirmations(deps, 'new');

    people['reg-ada'] = { email: 'not an address', firstName: 'Ada', lastName: null };
    advance(CONFIRMATION_LEASE_MS + MINUTE);
    expect(await runEntryConfirmations(deps, 'new')).toMatchObject({ sent: 0, failed: 1 });
    expect(sends).toHaveLength(0);
    // Delivery history lists a job that ended failed through its latest failed attempt: one line.
    expect(jobRows[0]!.status).toBe('failed');
    expect(
      attempts.filter(a => a.status === 'failed' && a.error === 'missing_recipient')
    ).toHaveLength(1);
    expect(entries[0]).toMatchObject({ confirmation_email_status: 'failed' });

    // Later runs add nothing: the entries wait for the daily run, which logs nothing new either.
    await runEntryConfirmations(deps, 'new');
    advance(DAY);
    await runEntryConfirmations(deps, 'all');
    expect(attempts.filter(a => a.error === 'missing_recipient')).toHaveLength(1);
    expect(logs).toHaveLength(0);
  });

  it('repeats exactly the payload a send began with when the provider answer was lost, so it dedupes', async () => {
    const venue = show();
    let lose = true;
    const { deps, sends, deliveries, logs, attempts, advance } = setup({
      shows: [venue],
      loseResponse: () => lose,
    });

    expect(await runEntryConfirmations(deps, 'new')).toMatchObject({ sent: 0, retrying: 1 });
    expect(deliveries.size).toBe(1); // the provider did accept it
    // The attempt record, not the ticket, holds what was sent; it is still unresolved.
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({ status: 'started' });
    expect(attempts[0]!.payload!.html).toContain('1200 Fairgrounds Rd');

    // Data changes before the retry; the retry must still be the very same message.
    venue.address = '77 New Venue Lane';
    lose = false;
    advance(10 * MINUTE);
    expect(await runEntryConfirmations(deps, 'new')).toMatchObject({ sent: 1 });
    expect(sends).toHaveLength(2);
    expect(sends[1]).toEqual(sends[0]);
    expect(deliveries.size).toBe(1);
    expect(logs).toHaveLength(1);
  });
});

describe('the marker is fenced by acceptance generation', () => {
  it('does not stamp a re-acceptance after the earlier acceptance was sent, and sends the new one its own email', async () => {
    const accepted = entry();
    const history: AcceptanceHistoryRow[] = [
      { id: 'hist-1', entry_id: accepted.id, changed_at: '2026-11-20T13:00:00Z' },
    ];
    const { deps, sends, jobRows, advance } = makeDeps({
      shows: [show()],
      entries: [accepted],
      history,
    });
    // The provider accepts, then the run stops before the entries are stamped.
    stopOnce(deps, 'markSent');
    await runEntryConfirmations(deps, 'new');
    expect(sends).toHaveLength(1);
    expect(accepted.confirmation_email_sent_at).toBeNull();

    // The secretary returns it to review and accepts again: new generation, markers reset, and
    // the change is recent, so the quiet period holds its own email back for now.
    advance(CONFIRMATION_LEASE_MS + MINUTE);
    history.push({ id: 'hist-2', entry_id: accepted.id, changed_at: '2026-11-20T15:05:00Z' });
    accepted.updated_at = '2026-11-20T15:10:00Z';
    accepted.confirmation_email_status = 'pending';

    expect(await runEntryConfirmations(deps, 'new')).toMatchObject({ reconciled: 1 });
    // The first job reconciled, but the new acceptance is NOT stamped by it.
    expect(accepted.confirmation_email_sent_at).toBeNull();
    expect(accepted.confirmation_email_status).toBe('pending');
    expect(sends).toHaveLength(1);

    // Once quiet, the new acceptance gets its own email and its own stamp.
    advance(15 * MINUTE);
    expect(await runEntryConfirmations(deps, 'new')).toMatchObject({ sent: 1 });
    expect(sends).toHaveLength(2);
    expect(new Set(sends.map(email => email.idempotencyKey)).size).toBe(2);
    expect(jobRows).toHaveLength(2);
    expect(accepted.confirmation_email_sent_at).not.toBeNull();
  });

  it('never clears a sent marker when a failure is recorded', async () => {
    const stamped = entry({
      confirmation_email_sent_at: '2026-11-10T09:00:00Z',
      confirmation_email_status: 'sent',
    });
    const { deps } = makeDeps({ shows: [show()], entries: [stamped] });
    await deps.markFailed([stamped.id], { [stamped.id]: 'none' });
    await deps.markFailed([stamped.id]);
    expect(stamped).toMatchObject({
      confirmation_email_sent_at: '2026-11-10T09:00:00Z',
      confirmation_email_status: 'sent',
    });
  });
});

describe('the run limit', () => {
  it('is not used up by exhibitors whose job is already waiting', async () => {
    const people: Record<string, { email: string; firstName: string; lastName: null }> = {};
    const entries = [];
    for (let i = 0; i < 55; i++) {
      people[`reg-${i}`] = { email: `x${i}@example.com`, firstName: `X${i}`, lastName: null };
      entries.push(
        entry({
          registration_id: `reg-${i}`,
          handler_id: `person-${i}`,
          updated_at: `2026-11-19T00:00:${String(i).padStart(2, '0')}Z`,
        })
      );
    }
    people['reg-new'] = { email: 'new@example.com', firstName: 'New', lastName: null };
    const newest = entry({
      registration_id: 'reg-new',
      handler_id: 'person-new',
      updated_at: '2026-11-20T14:50:00Z',
    });
    entries.push(newest);
    let refuse = true;
    const { deps, sends, advance } = makeDeps({
      shows: [show()],
      entries,
      people,
      sendResult: () =>
        refuse ? { ok: false, error: 'provider_http_500' } : { ok: true, messageId: '' },
    });

    // The oldest 50 are written, refused and left in backoff.
    await runEntryConfirmations(deps, 'new');
    expect(sends).toHaveLength(50);
    refuse = false;
    advance(MINUTE);
    // Five more are older than the newcomer: they and the newcomer go now, the waiting 50 do not.
    await runEntryConfirmations(deps, 'new');
    expect(sends.filter(email => email.to === 'new@example.com')).toHaveLength(1);
    expect(sends).toHaveLength(56);
  });
});

describe('a ticket re-gathers its group when it is sent', () => {
  it('after the anchor entry is reassigned to another handler, each handler gets only their own entries', async () => {
    const handlers = {
      'person-hal': { email: 'hal@example.com', firstName: 'Hal', lastName: null },
      'person-bea': { email: 'bea@example.com', firstName: 'Bea', lastName: null },
    };
    const moved = entry({
      registration_id: null,
      handler_id: 'person-hal',
      dog: { name: 'Moved Dog', call_name: 'Moved', breed: 'Lab', sex: 'F' },
    });
    const stays = entry({
      registration_id: null,
      handler_id: 'person-hal',
      dog_id: 'dog-stays',
      dog: { name: 'Stays Dog', call_name: 'Stays', breed: 'Lab', sex: 'M' },
    });
    const { deps, sends, jobRows, advance } = makeDeps({
      shows: [show()],
      entries: [moved, stays],
      people: {},
      handlers,
    });
    stopOnce(deps.jobs, 'loadAttempts'); // Hal's ticket is written and leased, never sent
    await runEntryConfirmations(deps, 'new');
    expect(jobRows).toHaveLength(1);

    // The secretary reassigns the first entry to Bea while the ticket waits.
    moved.handler_id = 'person-bea';
    moved.updated_at = LONG_AGO;
    advance(CONFIRMATION_LEASE_MS + MINUTE);
    await runEntryConfirmations(deps, 'new');

    const toHal = sends.filter(email => email.to === 'hal@example.com');
    const toBea = sends.filter(email => email.to === 'bea@example.com');
    expect(toHal).toHaveLength(1);
    expect(toHal[0]!.html).toContain('Stays Dog');
    expect(toHal[0]!.html).not.toContain('Moved Dog');
    expect(toBea).toHaveLength(1);
    expect(toBea[0]!.html).toContain('Moved Dog');
    expect(toBea[0]!.html).not.toContain('Stays Dog');
    expect(moved).toMatchObject({ confirmation_email_status: 'sent' });
    expect(stays).toMatchObject({ confirmation_email_status: 'sent' });
  });

  it('does not email an armband edited during backoff until it is quiet, then sends the corrected number', async () => {
    let refuse = true;
    const entries = [entry({ armband: '101' })];
    const { deps, sends, advance } = makeDeps({
      shows: [show()],
      entries,
      sendResult: () =>
        refuse ? { ok: false, error: 'provider_http_500' } : { ok: true, messageId: '' },
    });
    await runEntryConfirmations(deps, 'new'); // refused: the ticket waits 5 minutes
    expect(sends).toHaveLength(1);
    expect(sends[0]!.html).toContain('101');

    // The secretary corrects the armband during the backoff; updated_at moves to now.
    refuse = false;
    entries[0]!.armband = '202';
    entries[0]!.updated_at = new Date(deps.now().getTime() + 2 * MINUTE).toISOString();
    advance(6 * MINUTE); // the retry is due, the edit is only four minutes old
    expect(await runEntryConfirmations(deps, 'new')).toMatchObject({ sent: 0, deferred: 1 });
    expect(sends).toHaveLength(1);

    advance(10 * MINUTE); // quiet again
    expect(await runEntryConfirmations(deps, 'new')).toMatchObject({ sent: 1 });
    expect(sends).toHaveLength(2);
    expect(sends[1]!.html).toContain('202');
    expect(sends[1]!.html).not.toContain('101');
  });
});
