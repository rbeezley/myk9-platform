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

const movedTables = (extra: Row[] = []) =>
  tables(
    [move, ...extra],
    [entry({ id: 'entry-1', entry_status: 'moved' }), entry({ id: 'entry-2', class_id: 'class-2' })]
  );

describe('drainAutoEmailJobs for entry_changed', () => {
  it('tells a move (an accepted class change request lands as one) in plain words, once', async () => {
    const fixture = makeAutoSendSupabase(movedTables());
    const { fetch, promise } = drain(fixture);

    await expect(promise).resolves.toMatchObject({ claimed: 1, sent: 1, skipped: 0 });

    const sent = sentBody(fetch);
    expect(sent.to).toBe('jamie@example.com');
    expect(sent.subject).toBe('Change to your entry at Spring Scent Trial');
    expect(sent.html).toContain(
      'You are now entered in Interior Novice A (Saturday Trial, Saturday, November 21, 2026) with Vesper.'
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fixture.tables.email_log).toEqual([
      expect.objectContaining({ related_id: 'job-1', show_id: 'show-1' }),
    ]);
    expect(fixture.tables.show_lifecycle_email_jobs[0]).toMatchObject({ status: 'sent' });
  });

  it('releases held jobs before it claims, so only this sender ever sends them', async () => {
    const tableSet = movedTables();
    tableSet.show_lifecycle_email_jobs[0].status = 'held';
    const fixture = makeAutoSendSupabase(tableSet);
    const { fetch, promise } = drain(fixture);

    await expect(promise).resolves.toMatchObject({ claimed: 1, sent: 1 });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fixture.tables.show_lifecycle_email_jobs[0]).toMatchObject({ status: 'sent' });
  });

  it('does not release a held job of another step', async () => {
    const tableSet = movedTables();
    tableSet.show_lifecycle_email_jobs.push(
      autoJob({ id: 'job-2', status: 'held', idempotency_key: 'k-other' })
    );
    const fixture = makeAutoSendSupabase(tableSet);
    await drain(fixture).promise;
    expect(fixture.tables.show_lifecycle_email_jobs[1]).toMatchObject({ status: 'held' });
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
    expect(html).toContain('jump height for Vesper in Container Novice A');
    expect(html).toContain('changed from 8 to 16');
    expect(html).toContain('The handler for Vesper in Container Novice A');
    expect(html).toContain('is now Hal Handler');
  });

  it('skips an edit that was changed back and a move whose entry is no longer in that class', async () => {
    const fixture = makeAutoSendSupabase(
      tables(
        [{ kind: 'edited', entry_id: 'entry-1', field: 'jump_height', from: '12' }, move],
        [
          entry({ jump_height: '12' }),
          entry({ id: 'entry-2', class_id: 'class-1', jump_height: '12' }),
        ]
      )
    );
    const { fetch, promise } = drain(fixture);
    await expect(promise).resolves.toMatchObject({ claimed: 1, sent: 0, skipped: 1 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('tells a confirmed Pull, and only while the entry is still pulled', async () => {
    const pulled = makeAutoSendSupabase(
      tables([{ kind: 'pulled', entry_id: 'entry-1' }], [entry({ entry_status: 'scratched' })])
    );
    const first = drain(pulled);
    await first.promise;
    expect(sentBody(first.fetch).html).toContain(
      'Vesper has been pulled from Container Novice A (Saturday Trial, Saturday, November 21, 2026).'
    );

    const putBack = makeAutoSendSupabase(tables([{ kind: 'pulled', entry_id: 'entry-1' }]));
    const second = drain(putBack);
    await expect(second.promise).resolves.toMatchObject({ skipped: 1, sent: 0 });
    expect(second.fetch).not.toHaveBeenCalled();
  });

  it('says a pulled entry once, not also as an edit', async () => {
    const fixture = makeAutoSendSupabase(
      tables(
        [
          { kind: 'edited', entry_id: 'entry-1', field: 'jump_height', from: '8' },
          { kind: 'pulled', entry_id: 'entry-1' },
        ],
        [entry({ entry_status: 'scratched', jump_height: '12' })]
      )
    );
    const { fetch, promise } = drain(fixture);
    await promise;
    const { html } = sentBody(fetch);
    expect(html).toContain('has been pulled from');
    expect(html).not.toContain('jump height');
  });

  it('reads an edit made before a move on the entry the move ended on', async () => {
    const fixture = makeAutoSendSupabase(
      tables(
        [{ kind: 'edited', entry_id: 'entry-1', field: 'jump_height', from: '8' }, move],
        [
          entry({ id: 'entry-1', entry_status: 'moved', jump_height: '12' }),
          entry({ id: 'entry-2', class_id: 'class-2', jump_height: '12' }),
        ]
      )
    );
    const { fetch, promise } = drain(fixture);
    await promise;
    const { html } = sentBody(fetch);
    expect(html).toContain('You are now entered in Interior Novice A');
    expect(html).toContain('The jump height for Vesper in Interior Novice A');
  });

  it('sends nothing for an entry that belongs to someone else, or is of another show', async () => {
    const fixture = makeAutoSendSupabase(
      tables(
        [{ kind: 'pulled', entry_id: 'entry-1' }],
        [entry({ entry_status: 'scratched', dogs: { ...dog, owner_id: 'person-9' } })]
      )
    );
    const { fetch, promise } = drain(fixture);
    await expect(promise).resolves.toMatchObject({ skipped: 1 });
    expect(fetch).not.toHaveBeenCalled();

    const otherShow = makeAutoSendSupabase(
      tables(
        [{ kind: 'pulled', entry_id: 'entry-1' }],
        [entry({ entry_status: 'scratched', show_id: 'show-9' })]
      )
    );
    const second = drain(otherShow);
    await expect(second.promise).resolves.toMatchObject({ skipped: 1 });
    expect(second.fetch).not.toHaveBeenCalled();
  });

  it('is skipped, and recorded as skipped, when the show is no longer published', async () => {
    const tableSet = movedTables();
    tableSet.shows = [{ ...publishedShow, status: 'draft' }];
    const fixture = makeAutoSendSupabase(tableSet);
    const { fetch, promise } = drain(fixture);
    await expect(promise).resolves.toMatchObject({ skipped: 1, sent: 0 });
    expect(fetch).not.toHaveBeenCalled();
    expect(fixture.tables.show_lifecycle_email_jobs[0]).toMatchObject({ status: 'skipped' });
  });

  it('is sent even when the secretary switched the step off: there is no switch for it', async () => {
    const tableSet = movedTables();
    tableSet.show_lifecycle_email_steps = [
      { show_id: 'show-1', step_type: 'entry_changed', is_enabled: false },
    ];
    const fixture = makeAutoSendSupabase(tableSet);
    const { promise } = drain(fixture);
    await expect(promise).resolves.toMatchObject({ sent: 1 });
  });
});

describe('renderEntryChangedEmail', () => {
  it('says one change in the singular and many in the plural, with a link and no dash', () => {
    const one = renderEntryChangedEmail({
      showId: 'show-1',
      showName: 'Spring Scent Trial',
      recipientName: 'Jamie Handler',
      lines: ['Vesper has been pulled from Container Novice A.'],
    });
    expect(one.body).toContain('Hi Jamie,');
    expect(one.body).toContain('made a change to your entry at Spring Scent Trial.');
    expect(one.body).toContain('https://myk9show.com/exhibitor/entries?showId=show-1');
    const many = renderEntryChangedEmail({
      showId: 'show-1',
      showName: null,
      recipientName: null,
      lines: ['a', 'b'],
    });
    expect(many.body).toContain('Hi there,');
    expect(many.body).toContain('made 2 changes to your entries at your show.');
    expect(`${one.body}${many.body}`).not.toContain('\u2014');
  });
});
