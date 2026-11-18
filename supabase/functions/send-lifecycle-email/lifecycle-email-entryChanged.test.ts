import { describe, expect, it, vi } from 'vitest';
import { drainAutoEmailJobs } from './lifecycle-email-autoSend';
import { renderEntryChangedEmail } from './lifecycle-email-entryChanged';
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
    entry_status: 'confirmed',
    withdrawal_reason_code: null,
    check_in_status: 'no-status',
    handler_id: null,
    handler: null,
    jump_height: null,
    deleted_at: null,
    dogs: dog,
    ...overrides,
  };
}

function classRow(id: string, name: string, showId = 'show-1', overrides: Row = {}): Row {
  return {
    id,
    name,
    element: null,
    level: null,
    section: null,
    status: 'upcoming',
    deleted_at: null,
    trials: { name: 'Saturday Trial', date: '2026-11-21', show_id: showId, deleted_at: null },
    ...overrides,
  };
}

function tables(changes: unknown[], entries: Row[] = [entry()]): Record<string, Row[]> {
  return {
    shows: [publishedShow],
    show_lifecycle_email_jobs: [
      autoJob({ step_type: 'entry_changed', entry_changes: changes, idempotency_key: 'k-entry' }),
    ],
    entries,
    classes: [classRow('class-1', 'Container Novice A'), classRow('class-2', 'Interior Novice A')],
  };
}

const move = {
  kind: 'moved',
  entry_id: 'entry-2',
  from_entry_id: 'entry-1',
  from_class_id: 'class-1',
  to_class_id: 'class-2',
};

describe('drainAutoEmailJobs for entry_changed', () => {
  it('tells a move (an accepted class change request lands as one) in plain words, once', async () => {
    const fixture = makeAutoSendSupabase(
      tables(
        [move],
        [
          entry({ id: 'entry-1', entry_status: 'moved' }),
          entry({ id: 'entry-2', class_id: 'class-2' }),
        ]
      )
    );
    const { fetch, promise } = drain(fixture);

    await expect(promise).resolves.toMatchObject({ claimed: 1, sent: 1, skipped: 0 });

    const sent = sentBody(fetch);
    expect(sent.to).toBe('jamie@example.com');
    expect(sent.subject).toBe('Change to your entry at Spring Scent Trial');
    expect(sent.html).toContain(
      'Vesper: moved from Container Novice A (Saturday Trial, Saturday, November 21, 2026) to Interior Novice A (Saturday Trial, Saturday, November 21, 2026)'
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fixture.tables.email_log).toEqual([
      expect.objectContaining({ related_id: 'job-1', show_id: 'show-1' }),
    ]);
    expect(fixture.tables.show_lifecycle_email_jobs[0]).toMatchObject({ status: 'sent' });
  });

  it('merges several edits into one email and says what was true before the first edit', async () => {
    const fixture = makeAutoSendSupabase(
      tables(
        [
          { kind: 'edited', entry_id: 'entry-1', field: 'jump_height', from: '8' },
          { kind: 'edited', entry_id: 'entry-1', field: 'jump_height', from: '12' },
          { kind: 'edited', entry_id: 'entry-1', field: 'handler', from: null },
        ],
        [entry({ jump_height: '16', handler: 'Hal Handler' })]
      )
    );
    const { fetch, promise } = drain(fixture);
    await promise;
    const { html } = sentBody(fetch);
    expect(html).toContain('2 changes to your entries');
    expect(html).toContain('jump height changed from 8 to 16 in Container Novice A');
    expect(html).toContain('handler is now Hal Handler in Container Novice A');
  });

  it('skips an edit that was changed back, a move that was undone and a reinstated entry', async () => {
    const fixture = makeAutoSendSupabase(
      tables(
        [
          { kind: 'edited', entry_id: 'entry-1', field: 'jump_height', from: '12' },
          { kind: 'pulled', entry_id: 'entry-1' },
          { ...move, to_class_id: 'class-1' },
        ],
        // A move carries the height along to the entry it makes.
        [entry({ jump_height: '12' }), entry({ id: 'entry-2', jump_height: '12' })]
      )
    );
    const { fetch, promise } = drain(fixture);
    await expect(promise).resolves.toMatchObject({ claimed: 1, sent: 0, skipped: 1 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('says each act in its own words: pull, withdrawal, removal, pull at the show', async () => {
    const fixture = makeAutoSendSupabase(
      tables(
        [
          { kind: 'pulled', entry_id: 'entry-1' },
          { kind: 'withdrawn', entry_id: 'entry-2' },
          { kind: 'removed', entry_id: 'entry-3' },
          { kind: 'pulled_at_show', entry_id: 'entry-4' },
        ],
        [
          entry({ entry_status: 'scratched', dogs: { ...dog, call_name: 'Ash' } }),
          entry({
            id: 'entry-2',
            entry_status: 'withdrawn',
            withdrawal_reason_code: 'in_season',
            dogs: { ...dog, call_name: 'Bea' },
          }),
          entry({ id: 'entry-3', entry_status: 'withdrawn', dogs: { ...dog, call_name: 'Cal' } }),
          // The dog was flagged at check-in and the desk then confirmed the Pull.
          entry({
            id: 'entry-4',
            class_id: 'class-2',
            entry_status: 'scratched',
            check_in_status: 'pulled',
            dogs: { ...dog, call_name: 'Dot' },
          }),
        ]
      )
    );
    const { fetch, promise } = drain(fixture);
    await promise;
    const { html } = sentBody(fetch);
    expect(html).toContain('Ash: pulled from Container Novice A');
    expect(html).toContain('Bea: withdrawn from Container Novice A');
    expect(html).toContain('Cal: removed from Container Novice A');
    expect(html).toContain('Dot: pulled from Interior Novice A');
    expect(html).toContain('at the show');
    expect(html).not.toContain('Ash: withdrawn');
  });

  it('calls a ringside flag a flag, never a confirmed Pull', async () => {
    const fixture = makeAutoSendSupabase(
      tables(
        [{ kind: 'pull_flagged', entry_id: 'entry-1' }],
        [entry({ check_in_status: 'pulled' })]
      )
    );
    const { fetch, promise } = drain(fixture);
    await promise;
    const { html } = sentBody(fetch);
    expect(html).toContain(
      'Vesper: marked as pulled at check-in for Container Novice A (Saturday Trial, Saturday, November 21, 2026); the trial secretary has not confirmed it yet'
    );
    expect(html).not.toContain('pulled from');
  });

  it('drops a flag the desk has since cleared, and one confirmed as a Pull is told as that', async () => {
    const cleared = makeAutoSendSupabase(
      tables([{ kind: 'pull_flagged', entry_id: 'entry-1' }], [entry()])
    );
    const first = drain(cleared);
    await expect(first.promise).resolves.toMatchObject({ sent: 0, skipped: 1 });

    const confirmed = makeAutoSendSupabase(
      tables(
        [
          { kind: 'pull_flagged', entry_id: 'entry-1' },
          { kind: 'pulled_at_show', entry_id: 'entry-1' },
        ],
        [entry({ entry_status: 'scratched', check_in_status: 'pulled' })]
      )
    );
    const second = drain(confirmed);
    await second.promise;
    const { html } = sentBody(second.fetch);
    expect(html).toContain('pulled from Container Novice A');
    expect(html).toContain('at the show');
    expect(html).not.toContain('not confirmed');
  });

  it('tells an entry put back is active again, and nothing if it was pulled again since', async () => {
    const back = makeAutoSendSupabase(tables([{ kind: 'restored', entry_id: 'entry-1' }]));
    const first = drain(back);
    await first.promise;
    expect(sentBody(first.fetch).html).toContain(
      'Vesper: put back in Container Novice A (Saturday Trial, Saturday, November 21, 2026); your entry is active again'
    );

    const pulledAgain = makeAutoSendSupabase(
      tables([{ kind: 'restored', entry_id: 'entry-1' }], [entry({ entry_status: 'scratched' })])
    );
    const second = drain(pulledAgain);
    await expect(second.promise).resolves.toMatchObject({ sent: 0, skipped: 1 });
  });

  it('does not send a dog to a class it no longer runs: absent, declined or a cancelled class', async () => {
    for (const row of [entry({ entry_status: 'absent' }), entry({ entry_status: 'declined' })]) {
      const fixture = makeAutoSendSupabase(
        tables(
          [{ kind: 'edited', entry_id: 'entry-1', field: 'jump_height', from: '8' }],
          [{ ...row, jump_height: '12' }]
        )
      );
      const run = drain(fixture);
      await expect(run.promise).resolves.toMatchObject({ sent: 0, skipped: 1 });
    }

    const cancelled = tables(
      [
        { kind: 'edited', entry_id: 'entry-1', field: 'jump_height', from: '8' },
        { ...move, entry_id: 'entry-1', from_entry_id: 'entry-0' },
      ],
      [entry({ jump_height: '12' })]
    );
    cancelled.classes = [
      classRow('class-1', 'Container Novice A', 'show-1', { status: 'cancelled' }),
      classRow('class-2', 'Interior Novice A'),
    ];
    const run = drain(makeAutoSendSupabase(cancelled));
    await expect(run.promise).resolves.toMatchObject({ sent: 0, skipped: 1 });
    expect(run.fetch).not.toHaveBeenCalled();
  });

  it('records the moves and outcomes it told on the job, for a later reversal', async () => {
    const fixture = makeAutoSendSupabase(
      tables(
        [
          move,
          { kind: 'edited', entry_id: 'entry-2', field: 'jump_height', from: '8' },
          {
            kind: 'pulled',
            entry_id: 'entry-3',
          },
        ],
        [
          entry({ id: 'entry-1', entry_status: 'moved' }),
          entry({ id: 'entry-2', class_id: 'class-2', jump_height: '12' }),
          entry({ id: 'entry-3', entry_status: 'scratched' }),
        ]
      )
    );
    const { promise } = drain(fixture);
    await promise;
    expect(fixture.tables.show_lifecycle_email_jobs[0]).toMatchObject({
      status: 'sent',
      delivered_changes: expect.arrayContaining([
        { kind: 'moved', entry_id: 'entry-2', from_class_id: 'class-1', to_class_id: 'class-2' },
        { kind: 'pulled', entry_id: 'entry-3' },
      ]),
    });
    expect(
      (fixture.tables.show_lifecycle_email_jobs[0].delivered_changes as unknown[]).length
    ).toBe(2);
  });

  it('does not call a pull a withdrawal when the stored act no longer matches the event', async () => {
    const fixture = makeAutoSendSupabase(
      tables([{ kind: 'withdrawn', entry_id: 'entry-1' }], [entry({ entry_status: 'scratched' })])
    );
    const { fetch, promise } = drain(fixture);
    await expect(promise).resolves.toMatchObject({ sent: 0, skipped: 1 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('tells an edit made before a move against the entry it ended on, with the latest value', async () => {
    const fixture = makeAutoSendSupabase(
      tables(
        [
          { kind: 'edited', entry_id: 'entry-1', field: 'jump_height', from: '8' },
          move,
          { kind: 'edited', entry_id: 'entry-2', field: 'jump_height', from: '12' },
        ],
        [
          entry({ id: 'entry-1', entry_status: 'moved', jump_height: '12' }),
          entry({ id: 'entry-2', class_id: 'class-2', jump_height: '16' }),
        ]
      )
    );
    const { fetch, promise } = drain(fixture);
    await promise;
    const { html } = sentBody(fetch);
    expect(html).toContain('jump height changed from 8 to 16 in Interior Novice A');
    expect(html).not.toContain('in Container Novice A (');
    expect(html).not.toContain('from 12');
  });

  it('drops an edit on an entry that has since been pulled', async () => {
    const fixture = makeAutoSendSupabase(
      tables(
        [{ kind: 'edited', entry_id: 'entry-1', field: 'jump_height', from: '8' }],
        [entry({ entry_status: 'scratched', jump_height: '12' })]
      )
    );
    const { promise } = drain(fixture);
    await expect(promise).resolves.toMatchObject({ sent: 0, skipped: 1 });
  });

  it('follows the handler name Edit Entry saves, not the identity link', async () => {
    const fixture = makeAutoSendSupabase(
      tables(
        [{ kind: 'edited', entry_id: 'entry-1', field: 'handler', from: 'Hal Handlr' }],
        [entry({ handler: 'Hal Handler', handler_id: null })]
      )
    );
    const { fetch, promise } = drain(fixture);
    await promise;
    expect(sentBody(fetch).html).toContain(
      'handler changed from Hal Handlr to Hal Handler in Container Novice A'
    );
  });

  it('names no entry and no class of another show', async () => {
    const data = tables(
      [
        { kind: 'pulled', entry_id: 'entry-9' },
        { ...move, from_class_id: 'class-9' },
      ],
      [
        entry({ id: 'entry-9', show_id: 'show-9', entry_status: 'scratched' }),
        entry({ id: 'entry-1', entry_status: 'moved', class_id: 'class-9' }),
        entry({ id: 'entry-2', class_id: 'class-2' }),
      ]
    );
    data.classes.push(classRow('class-9', 'Other Show Class', 'show-9'));
    const fixture = makeAutoSendSupabase(data);
    const { fetch, promise } = drain(fixture);
    await expect(promise).resolves.toMatchObject({ sent: 0, skipped: 1 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sends even when the step row was switched off: a change email has no switch', async () => {
    const data = tables(
      [{ kind: 'pulled', entry_id: 'entry-1' }],
      [entry({ entry_status: 'scratched' })]
    );
    data.show_lifecycle_email_steps = [
      { show_id: 'show-1', step_type: 'entry_changed', is_enabled: false },
    ];
    const fixture = makeAutoSendSupabase(data);
    const { promise } = drain(fixture);
    await expect(promise).resolves.toMatchObject({ sent: 1, skipped: 0 });
  });

  it('says nothing about an entry the recipient no longer owns or handles', async () => {
    const fixture = makeAutoSendSupabase(
      tables(
        [{ kind: 'pulled', entry_id: 'entry-1' }],
        [entry({ entry_status: 'scratched', dogs: { ...dog, owner_id: 'someone-else' } })]
      )
    );
    const { promise } = drain(fixture);
    await expect(promise).resolves.toMatchObject({ sent: 0, skipped: 1 });
  });

  it('skips when the show is no longer published and records nothing as sent', async () => {
    const data = tables(
      [{ kind: 'pulled', entry_id: 'entry-1' }],
      [entry({ entry_status: 'scratched' })]
    );
    data.shows = [{ ...publishedShow, status: 'draft' }];
    const fixture = makeAutoSendSupabase(data);
    const { fetch, promise } = drain(fixture);
    await expect(promise).resolves.toMatchObject({ sent: 0, skipped: 1 });
    expect(fetch).not.toHaveBeenCalled();
    expect(fixture.tables.show_lifecycle_email_jobs[0]).toMatchObject({ status: 'skipped' });
  });
});

describe('entry changed email wording', () => {
  it('has no em dash or emoji, links to My Shows and falls back to there', () => {
    const email = renderEntryChangedEmail({
      showId: 'show-1',
      showName: null,
      recipientName: null,
      lines: [
        { kind: 'pulled', dogName: 'Vesper', classLabel: 'Novice', text: 'pulled from Novice' },
      ],
    });
    expect(email.subject).toBe('Change to your entry at your show');
    expect(email.body).toContain('Hi there,');
    expect(email.body).toContain('https://myk9show.com/exhibitor/entries?showId=show-1');
    expect(email.body).not.toMatch(/—|\p{Extended_Pictographic}/u);
  });
});
