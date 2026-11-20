import { describe, expect, it, vi } from 'vitest';
import { drainAutoEmailJobs } from './lifecycle-email-autoSend';
import { autoJob, makeAutoSendSupabase, publishedShow } from './lifecycle-email-autoSend.testUtils';

type Row = Record<string, unknown>;

function drain(fixture: ReturnType<typeof makeAutoSendSupabase>) {
  const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ id: 'resend-1' }) }));
  const promise = drainAutoEmailJobs({
    deps: { fetch: fetch as unknown as typeof globalThis.fetch, resendApiKey: 'resend-key' },
    supabase: fixture.supabase,
    now: () => fixture.clock.at,
  });
  return { fetch, promise };
}

function sentBody(fetch: ReturnType<typeof vi.fn>) {
  const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
  return JSON.parse(String(init.body)) as { to: string; subject: string; html: string };
}

const dog = { name: 'Vesper of Fairfield', call_name: 'Vesper', owner_id: 'person-1' };

function entry(overrides: Row = {}): Row {
  return {
    id: 'entry-1',
    show_id: 'show-1',
    class_id: 'class-1',
    entry_status: 'scratched',
    refund_decision: 'denied',
    refund_decision_reason: 'The refund deadline had passed.',
    refund_decided_at: '2026-11-20T10:00:00.000Z',
    refund_amount: null,
    refunded_at: null,
    payment_status: 'paid',
    handler_id: null,
    deleted_at: null,
    dogs: dog,
    ...overrides,
  };
}

function tables(
  showStatus = 'published',
  entries: Row[] = [entry()],
  jobOverrides: Row = {}
): Record<string, Row[]> {
  return {
    shows: [{ ...publishedShow, status: showStatus }],
    show_lifecycle_email_jobs: [
      autoJob({
        step_type: 'refund_denied',
        entry_changes: [
          { kind: 'refund_denied', entry_id: 'entry-1', decided_at: '2026-11-20T10:00:00+00:00' },
        ],
        idempotency_key: 'k-refund-denied',
        status: 'held',
        ...jobOverrides,
      }),
    ],
    entries,
    classes: [
      {
        id: 'class-1',
        name: 'Novice Interior',
        element: null,
        level: null,
        section: null,
        status: 'completed',
        deleted_at: null,
        trials: { name: 'Saturday Trial', date: '2026-11-21', show_id: 'show-1', deleted_at: null },
      },
    ],
  };
}

describe('drainAutoEmailJobs for refund_denied (MYK9-2249)', () => {
  it('says no refund for the dog in the class, with her reason, and names no money', async () => {
    const fixture = makeAutoSendSupabase(tables());
    const { fetch, promise } = drain(fixture);

    await expect(promise).resolves.toMatchObject({ claimed: 1, sent: 1, skipped: 0 });

    const sent = sentBody(fetch);
    expect(sent.to).toBe('jamie@example.com');
    expect(sent.subject).toBe('Refund decision at Spring Scent Trial');
    expect(sent.html).toContain('No refund for Vesper in Novice Interior.');
    // No date and no trial: the owner's wording names neither.
    expect(sent.html).not.toContain('November');
    expect(sent.html).not.toContain('Saturday');
    expect(sent.html).toContain('The refund deadline had passed.');
    expect(sent.html).not.toMatch(/\$\d/);
    expect(fixture.tables.show_lifecycle_email_jobs[0]).toMatchObject({ status: 'sent' });
  });

  // The delivery half of the completed-show rule: the job is not stopped at the published gate,
  // it reaches the provider call.
  it('drains a denial on a COMPLETED show through to the provider call', async () => {
    const fixture = makeAutoSendSupabase(tables('completed'));
    const { fetch, promise } = drain(fixture);

    await expect(promise).resolves.toMatchObject({ claimed: 1, sent: 1, skipped: 0 });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(sentBody(fetch).html).toContain('No refund for Vesper');
    expect(fixture.tables.email_log).toEqual([
      expect.objectContaining({ related_id: 'job-1', show_id: 'show-1' }),
    ]);
    expect(fixture.tables.show_lifecycle_email_jobs[0]).toMatchObject({ status: 'sent' });
  });

  it.each(['draft', 'cancelled'])('sends nothing for a %s show', async status => {
    const fixture = makeAutoSendSupabase(tables(status));
    const { fetch, promise } = drain(fixture);

    await expect(promise).resolves.toMatchObject({ sent: 0, skipped: 1 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('is told to the handler as well as the owner, and not to a co-owner', async () => {
    const handlerJob = makeAutoSendSupabase(
      tables('published', [
        entry({ handler_id: 'person-1', dogs: { ...dog, owner_id: 'person-9' } }),
      ])
    );
    const handler = drain(handlerJob);
    await expect(handler.promise).resolves.toMatchObject({ sent: 1 });

    const coOwnerJob = makeAutoSendSupabase(
      tables('published', [
        entry({
          handler_id: 'person-8',
          dogs: { ...dog, owner_id: 'person-9', co_owner_id: 'person-1' },
        }),
      ])
    );
    const coOwner = drain(coOwnerJob);
    await expect(coOwner.promise).resolves.toMatchObject({ sent: 0, skipped: 1 });
    expect(coOwner.fetch).not.toHaveBeenCalled();
  });

  it.each([
    ['a legacy denial with no reason', { refund_decision_reason: null }],
    [
      'a denial reversed since (reinstated)',
      { refund_decision: null, refund_decision_reason: null },
    ],
    ['a deleted entry', { deleted_at: '2026-11-20T00:00:00Z' }],
    ['a refund issued since (amount booked)', { refund_amount: 30 }],
    ['a refund issued since (refund date booked)', { refunded_at: '2026-11-20T11:00:00Z' }],
    ['a refund issued since (payment refunded)', { payment_status: 'refunded' }],
    [
      'a denial since replaced by a later one (reinstated, then denied again)',
      { refund_decided_at: '2026-11-20T12:00:00.000Z', refund_decision_reason: 'Second reason.' },
    ],
  ])('sends nothing for %s', async (_label, overrides) => {
    const fixture = makeAutoSendSupabase(tables('published', [entry(overrides)]));
    const { fetch, promise } = drain(fixture);

    await expect(promise).resolves.toMatchObject({ sent: 0, skipped: 1 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('is not held back by the show switching the step off', async () => {
    const tableSet = tables();
    tableSet.show_lifecycle_email_steps = [
      { show_id: 'show-1', step_type: 'refund_denied', is_enabled: false },
    ];
    const fixture = makeAutoSendSupabase(tableSet);
    const { promise } = drain(fixture);

    await expect(promise).resolves.toMatchObject({ sent: 1 });
  });
});
