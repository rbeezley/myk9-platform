import { describe, expect, it, vi } from 'vitest';
import { drainAutoEmailJobs } from './lifecycle-email-autoSend';
import { CLUB_CONTACTS_YOU, SECRETARY_DECIDES } from './lifecycle-email-pullOut';
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
    withdrawal_reason_code: null,
    payment_method: 'online',
    payment_status: 'paid',
    refund_amount: null,
    refund_decision: null,
    handler_id: null,
    deleted_at: null,
    dogs: dog,
    ...overrides,
  };
}

function job(stepType: 'pulled_out', events: Row[]): Row {
  return autoJob({
    step_type: stepType,
    entry_changes: events,
    idempotency_key: `k-${stepType}`,
    status: 'held',
  });
}

function tables(
  stepType: 'pulled_out',
  events: Row[],
  entries: Row[] = [entry()],
  extra: Record<string, Row[]> = {}
): Record<string, Row[]> {
  return {
    shows: [publishedShow],
    show_lifecycle_email_jobs: [job(stepType, events)],
    entries,
    classes: [
      {
        id: 'class-1',
        name: 'Novice Interior',
        element: null,
        level: null,
        section: null,
        status: 'upcoming',
        deleted_at: null,
        trials: { name: 'Saturday Trial', date: '2026-11-21', show_id: 'show-1', deleted_at: null },
      },
    ],
    ...extra,
  };
}

const removed = { kind: 'removed', entry_id: 'entry-1' };

describe('drainAutoEmailJobs for pulled_out (MYK9-2001)', () => {
  it('names the dog and class, says the refund waits for the secretary, and promises no amount', async () => {
    const fixture = makeAutoSendSupabase(tables('pulled_out', [removed]));
    const { fetch, promise } = drain(fixture);

    await expect(promise).resolves.toMatchObject({ claimed: 1, sent: 1, skipped: 0 });

    const sent = sentBody(fetch);
    expect(sent.to).toBe('jamie@example.com');
    expect(sent.subject).toBe('Entries removed at Spring Scent Trial');
    expect(sent.html).toContain(
      'Vesper is out of Novice Interior (Saturday Trial, Saturday, November 21, 2026).'
    );
    expect(sent.html).toContain(SECRETARY_DECIDES);
    // MYK9-2241: the link anchors on the show, never the payment-receipt view.
    expect(sent.html).toContain('exhibitor/entries?show=');
    expect(sent.html).not.toContain('showId=');
    // No amount and no date: only the wording above speaks about money.
    expect(sent.html).not.toMatch(/\$\d/);
    expect(fixture.tables.email_log).toEqual([
      expect.objectContaining({ related_id: 'job-1', show_id: 'show-1' }),
    ]);
    expect(fixture.tables.show_lifecycle_email_jobs[0]).toMatchObject({ status: 'sent' });
  });

  it('says only that the club will contact her once the club has been paid out', async () => {
    const fixture = makeAutoSendSupabase(
      tables('pulled_out', [removed], [entry()], {
        show_payouts: [{ id: 'payout-1', show_id: 'show-1', status: 'completed' }],
      })
    );
    const { fetch, promise } = drain(fixture);

    await promise;

    const sent = sentBody(fetch);
    expect(sent.html).toContain(CLUB_CONTACTS_YOU);
    expect(sent.html).not.toContain(SECRETARY_DECIDES);
  });

  it('does not treat a payout that is not completed as the club having been paid', async () => {
    const fixture = makeAutoSendSupabase(
      tables('pulled_out', [removed], [entry()], {
        show_payouts: [{ id: 'payout-1', show_id: 'show-1', status: 'awaiting_approval' }],
      })
    );
    const { fetch, promise } = drain(fixture);

    await promise;

    expect(sentBody(fetch).html).toContain(SECRETARY_DECIDES);
  });

  it('says nothing about money for an entry paid by check', async () => {
    const fixture = makeAutoSendSupabase(
      tables('pulled_out', [removed], [entry({ payment_method: 'check' })])
    );
    const { fetch, promise } = drain(fixture);

    await promise;

    const sent = sentBody(fetch);
    expect(sent.html).toContain('Vesper is out of Novice Interior');
    expect(sent.html).not.toContain('refund');
    expect(sent.html).not.toMatch(/\$\d/);
  });

  it('tells a withdrawal with a reason code, and sends nothing for a codeless removal', async () => {
    const withdrawn = makeAutoSendSupabase(
      tables(
        'pulled_out',
        [removed],
        [entry({ entry_status: 'withdrawn', withdrawal_reason_code: 'judge_change' })]
      )
    );
    const first = drain(withdrawn);
    await expect(first.promise).resolves.toMatchObject({ sent: 1 });

    const removal = makeAutoSendSupabase(
      tables('pulled_out', [removed], [entry({ entry_status: 'withdrawn' })])
    );
    const second = drain(removal);
    await expect(second.promise).resolves.toMatchObject({ sent: 0, skipped: 1 });
    expect(second.fetch).not.toHaveBeenCalled();
  });

  it('sends one email for several classes pulled in one sitting', async () => {
    const fixture = makeAutoSendSupabase(
      tables(
        'pulled_out',
        [removed, { kind: 'removed', entry_id: 'entry-2' }],
        [entry(), entry({ id: 'entry-2', dogs: { ...dog, call_name: 'Mabel' } })]
      )
    );
    const { fetch, promise } = drain(fixture);

    await expect(promise).resolves.toMatchObject({ sent: 1 });

    const sent = sentBody(fetch);
    expect(sent.html).toContain('Mabel is out of Novice Interior');
    expect(sent.html).toContain('Vesper is out of Novice Interior');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('skips an entry that was put back before the email went out', async () => {
    const fixture = makeAutoSendSupabase(
      tables('pulled_out', [removed], [entry({ entry_status: 'confirmed' })])
    );
    const { fetch, promise } = drain(fixture);

    await expect(promise).resolves.toMatchObject({ sent: 0, skipped: 1 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('is not held back by the show switching the step off', async () => {
    const tableSet = tables('pulled_out', [removed]);
    tableSet.show_lifecycle_email_steps = [
      { show_id: 'show-1', step_type: 'pulled_out', is_enabled: false },
    ];
    const fixture = makeAutoSendSupabase(tableSet);
    const { promise } = drain(fixture);

    await expect(promise).resolves.toMatchObject({ sent: 1 });
  });
});

describe('drainAutoEmailJobs for pulled_out, a co-owner who pulled (MYK9-2001)', () => {
  it('tells the co-owner who is neither the owner nor the handler', async () => {
    const fixture = makeAutoSendSupabase(
      tables(
        'pulled_out',
        [removed],
        [
          entry({
            handler_id: 'person-8',
            dogs: { ...dog, owner_id: 'person-9', co_owner_id: 'person-1' },
          }),
        ]
      )
    );
    const { fetch, promise } = drain(fixture);

    await expect(promise).resolves.toMatchObject({ sent: 1, skipped: 0 });
    expect(sentBody(fetch).html).toContain('Vesper is out of Novice Interior');
  });

  it('does not tell a person who is none of owner, co-owner or handler', async () => {
    const fixture = makeAutoSendSupabase(
      tables(
        'pulled_out',
        [removed],
        [
          entry({
            handler_id: 'person-8',
            dogs: { ...dog, owner_id: 'person-9', co_owner_id: 'person-7' },
          }),
        ]
      )
    );
    const { fetch, promise } = drain(fixture);

    await expect(promise).resolves.toMatchObject({ sent: 0, skipped: 1 });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('drainAutoEmailJobs for pulled_out, the show and the money (MYK9-2001)', () => {
  it.each([
    { label: 'unpublished', status: 'draft' },
    { label: 'completed', status: 'completed' },
    { label: 'cancelled', status: 'cancelled' },
  ])('skips a pulled-out email for a $label show', async ({ status }) => {
    const tableSet = tables('pulled_out', [removed]);
    tableSet.shows = [{ ...publishedShow, status }];
    const { fetch, promise } = drain(makeAutoSendSupabase(tableSet));

    await expect(promise).resolves.toMatchObject({ sent: 0, skipped: 1 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    { label: 'a refund already recorded', overrides: { refund_amount: 30 } },
    { label: 'a denial already recorded', overrides: { refund_decision: 'denied' } },
  ])('does not say the refund is waiting when $label', async ({ overrides }) => {
    const fixture = makeAutoSendSupabase(tables('pulled_out', [removed], [entry(overrides)]));
    const { fetch, promise } = drain(fixture);

    await expect(promise).resolves.toMatchObject({ sent: 1 });
    const { html } = sentBody(fetch);
    expect(html).toContain('Vesper is out of Novice Interior');
    expect(html).not.toContain(SECRETARY_DECIDES);
    expect(html).not.toContain(CLUB_CONTACTS_YOU);
  });
});
