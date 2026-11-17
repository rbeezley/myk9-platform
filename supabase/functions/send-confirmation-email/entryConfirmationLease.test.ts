// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CONFIRMATION_LEASE_MS } from './entryConfirmations';
import { runEntryConfirmations } from './entryConfirmationRun';
import {
  entry,
  makeDeps,
  NOW,
  resetEntrySeq,
  show,
  LONG_AGO,
  type StoredEntry,
} from './entryConfirmationRunHarness';
import type { AcceptanceHistoryRow } from './entryConfirmations';

// MYK9-2088: a claim is a lease. An interrupted run's entries come back when the lease expires,
// a send that the provider already accepted is deduplicated by its idempotency key, and the stamp
// is fenced on the lease so a re-acceptance is never marked sent by the old run.

const AFTER_LEASE = CONFIRMATION_LEASE_MS + 60_000;
const leaseFrom = (start: Date) => new Date(start.getTime() + CONFIRMATION_LEASE_MS).toISOString();

beforeEach(resetEntrySeq);

describe('the confirmation claim lease (MYK9-2088)', () => {
  it('recovers a claim whose run stopped before the send: once the lease expires the next run sends exactly once', async () => {
    const entries = [entry()];
    const { deps, sends, advance } = makeDeps({ shows: [show()], entries });

    // A run claimed the entry and died before sending.
    const claimed = await deps.claim(
      [entries[0]!.id],
      ['pending'],
      NOW.toISOString(),
      leaseFrom(NOW)
    );
    expect(claimed).toEqual([entries[0]!.id]);
    expect(entries[0]).toMatchObject({
      confirmation_email_sent_at: null,
      confirmation_claimed_until: leaseFrom(NOW),
    });

    // While the lease is live nothing is sent, so a slow live run is never doubled.
    advance(5 * 60_000);
    expect(await runEntryConfirmations(deps, 'new')).toMatchObject({ sent: 0 });
    expect(sends).toHaveLength(0);

    advance(AFTER_LEASE);
    expect(await runEntryConfirmations(deps, 'new')).toMatchObject({ sent: 1, failed: 0 });
    expect(await runEntryConfirmations(deps, 'new')).toMatchObject({ sent: 0 });
    expect(sends).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      confirmation_email_status: 'sent',
      confirmation_claimed_until: null,
    });
    expect(entries[0]!.confirmation_email_sent_at).not.toBeNull();
  });

  it('stamps only after the provider accepts: a run that sends leaves the lease and no stamp until then', async () => {
    const entries = [entry()];
    const { deps } = makeDeps({ shows: [show()], entries });
    let seenDuringSend: Partial<StoredEntry> = {};
    const send = deps.send;
    deps.send = async email => {
      seenDuringSend = { ...entries[0]! };
      return send(email);
    };
    await runEntryConfirmations(deps, 'new');
    expect(seenDuringSend.confirmation_email_sent_at).toBeNull();
    expect(seenDuringSend.confirmation_claimed_until).toBe(leaseFrom(NOW));
  });

  it('reconciles a send the provider accepted but the run never stamped: same key, one delivery', async () => {
    const entries = [entry()];
    const { deps, sends, deliveries, advance } = makeDeps({
      shows: [show()],
      entries,
      markSentFails: Infinity,
    });

    // The provider accepted; the stamp could not be written (the run stopped or the write failed).
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await runEntryConfirmations(deps, 'new')).toMatchObject({ sent: 1 });
    // Named for an operator: the group, the key and the provider's message id.
    expect(error).toHaveBeenCalledWith(
      'Confirmation accepted by the provider but could not be marked sent',
      expect.objectContaining({
        group: 'show-1:registration:reg-ada',
        idempotencyKey: sends[0]!.idempotencyKey,
        messageId: 'msg-1',
      })
    );
    error.mockRestore();
    expect(entries[0]).toMatchObject({
      confirmation_email_sent_at: null,
      confirmation_claimed_until: leaseFrom(NOW),
    });
    expect(deliveries.size).toBe(1);

    // Live lease: not sent again.
    advance(5 * 60_000);
    await runEntryConfirmations(deps, 'new');
    expect(sends).toHaveLength(1);

    // Lease expired, the stamp works again: the retry carries the same key and is deduplicated.
    const stamped = makeDeps({ shows: [show()], entries });
    stamped.advance(5 * 60_000 + AFTER_LEASE);
    stamped.deps.send = async email => {
      sends.push(email);
      const earlier = deliveries.get(email.idempotencyKey);
      if (!earlier) deliveries.set(email.idempotencyKey, 'msg-new');
      return { ok: true as const, messageId: earlier ?? 'msg-new' };
    };
    expect(await runEntryConfirmations(stamped.deps, 'new')).toMatchObject({ sent: 1 });

    expect(sends).toHaveLength(2);
    expect(sends[1]!.idempotencyKey).toBe(sends[0]!.idempotencyKey);
    expect(deliveries.size).toBe(1);
    expect(entries[0]).toMatchObject({
      confirmation_email_status: 'sent',
      confirmation_email_message_id: 'msg-1',
      confirmation_claimed_until: null,
    });
  });

  it('lets two overlapping runs send one email', async () => {
    const entries = [entry(), entry()];
    const { deps, sends } = makeDeps({ shows: [show()], entries });
    const [a, b] = await Promise.all([
      runEntryConfirmations(deps, 'new'),
      runEntryConfirmations(deps, 'new'),
    ]);
    expect(sends).toHaveLength(1);
    expect(a.sent + b.sent).toBe(1);
  });

  it('does not mark a re-accepted entry sent, and sends it its own email under a new key', async () => {
    const accepted = entry();
    const history: AcceptanceHistoryRow[] = [
      { id: 'hist-1', entry_id: accepted.id, changed_at: '2026-11-20T13:00:00Z' },
    ];
    let reaccept = true;
    const { deps, sends, advance } = makeDeps({
      shows: [show()],
      entries: [accepted],
      history,
      // The secretary sends it back to review and accepts again while the email is in flight:
      // the status change voids the lease (the database trigger), the trigger resets the markers.
      sendResult: () => {
        if (reaccept) {
          reaccept = false;
          accepted.confirmation_claimed_until = null;
          accepted.confirmation_email_sent_at = null;
          accepted.confirmation_email_status = 'pending';
          accepted.updated_at = LONG_AGO;
          history.push({ id: 'hist-2', entry_id: accepted.id, changed_at: '2026-11-20T15:00:30Z' });
        }
        return { ok: true as const, messageId: 'msg-first' };
      },
    });

    expect(await runEntryConfirmations(deps, 'new')).toMatchObject({ sent: 1 });
    // The old run's stamp did not reach the new acceptance.
    expect(accepted).toMatchObject({
      confirmation_email_sent_at: null,
      confirmation_email_status: 'pending',
      confirmation_claimed_until: null,
    });

    advance(60_000);
    expect(await runEntryConfirmations(deps, 'new')).toMatchObject({ sent: 1 });
    expect(sends).toHaveLength(2);
    expect(sends[1]!.idempotencyKey).not.toBe(sends[0]!.idempotencyKey);
    expect(accepted.confirmation_email_status).toBe('sent');
  });

  it('keeps a provider refusal observable and retryable: released, failed, logged, retried by the daily run', async () => {
    let refuse = true;
    const entries = [entry()];
    const { deps, sends, logs, advance } = makeDeps({
      shows: [show()],
      entries,
      sendResult: () =>
        refuse ? { ok: false, error: 'provider_http_500' } : { ok: true, messageId: 'msg-ok' },
    });

    expect(await runEntryConfirmations(deps, 'new')).toMatchObject({ sent: 0, failed: 1 });
    expect(entries[0]).toMatchObject({
      confirmation_email_sent_at: null,
      confirmation_claimed_until: null,
      confirmation_email_status: 'failed',
    });
    expect(logs).toEqual([
      expect.objectContaining({ status: 'failed', error_message: 'provider_http_500' }),
    ]);

    // The frequent run does not retry a failure; the daily run does.
    await runEntryConfirmations(deps, 'new');
    expect(sends).toHaveLength(1);
    refuse = false;
    advance(24 * 60 * 60 * 1000);
    expect(await runEntryConfirmations(deps, 'all')).toMatchObject({ sent: 1 });
    expect(sends[1]!.idempotencyKey).toBe(sends[0]!.idempotencyKey);
    expect(entries[0]!.confirmation_email_status).toBe('sent');
  });

  it('leaves a historical send untouched and never sends it again', async () => {
    const historical = entry({
      confirmation_email_sent_at: '2026-11-01T00:00:00Z',
      confirmation_email_status: 'sent',
      confirmation_email_message_id: 'msg-historical',
    });
    const { deps, sends, advance } = makeDeps({ shows: [show()], entries: [historical] });
    await runEntryConfirmations(deps, 'all');
    advance(AFTER_LEASE);
    await runEntryConfirmations(deps, 'all');
    expect(sends).toHaveLength(0);
    expect(historical).toMatchObject({
      confirmation_email_sent_at: '2026-11-01T00:00:00Z',
      confirmation_email_status: 'sent',
      confirmation_email_message_id: 'msg-historical',
      confirmation_claimed_until: null,
    });
  });

  it('retries a transient stamp failure inline: stamped, one send', async () => {
    const entries = [entry()];
    const { deps, sends } = makeDeps({ shows: [show()], entries, markSentFails: 2 });
    expect(await runEntryConfirmations(deps, 'new')).toMatchObject({ sent: 1 });
    expect(sends).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      confirmation_email_status: 'sent',
      confirmation_claimed_until: null,
    });
    expect(entries[0]!.confirmation_email_sent_at).not.toBeNull();
  });

  it('recovers on the frequent run a daily retry that was accepted but not stamped: same key, one delivery', async () => {
    let refuse = true;
    const entries = [entry()];
    const control = { stampFailures: 0 };
    const { deps, sends, deliveries, advance } = makeDeps({
      shows: [show()],
      entries,
      sendResult: undefined,
    });
    const realSend = deps.send;
    const realMarkSent = deps.markSent;
    deps.send = async email => {
      if (refuse) {
        sends.push(email);
        return { ok: false as const, error: 'provider_http_500' };
      }
      return realSend(email);
    };
    deps.markSent = async (...args) => {
      if (control.stampFailures > 0) throw new Error('database error');
      return realMarkSent(...args);
    };

    // A failure without a lease stays on the daily cadence.
    await runEntryConfirmations(deps, 'new');
    expect(entries[0]).toMatchObject({
      confirmation_email_status: 'failed',
      confirmation_claimed_until: null,
    });
    advance(60_000);
    await runEntryConfirmations(deps, 'new');
    expect(sends).toHaveLength(1);

    // The daily run sends; the provider accepts; the stamp cannot be written.
    refuse = false;
    control.stampFailures = 99;
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    advance(24 * 60 * 60 * 1000);
    expect(await runEntryConfirmations(deps, 'all')).toMatchObject({ sent: 1 });
    error.mockRestore();
    expect(entries[0]).toMatchObject({ confirmation_email_status: 'failed' });
    expect(entries[0]!.confirmation_claimed_until).not.toBeNull();

    // The lease expires: the next frequent run recovers it, whatever its status, same key.
    control.stampFailures = 0;
    advance(AFTER_LEASE);
    expect(await runEntryConfirmations(deps, 'new')).toMatchObject({ sent: 1 });
    expect(sends).toHaveLength(3);
    expect(sends[2]!.idempotencyKey).toBe(sends[1]!.idempotencyKey);
    expect(deliveries.size).toBe(1);
    expect(entries[0]).toMatchObject({
      confirmation_email_status: 'sent',
      confirmation_claimed_until: null,
    });
  });
});
