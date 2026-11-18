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
    class_id: 'class-1',
    entry_status: 'confirmed',
    check_in_status: 'no-status',
    handler_id: null,
    jump_height: null,
    deleted_at: null,
    dogs: dog,
    ...overrides,
  };
}

function classRow(id: string, name: string): Row {
  return {
    id,
    name,
    element: null,
    level: null,
    section: null,
    trials: { name: 'Saturday Trial', date: '2026-11-21' },
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
    people: [
      { id: 'person-2', first_name: 'Hal', last_name: 'Handler' },
      { id: 'person-3', first_name: 'Sue', last_name: 'Secretary' },
    ],
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
        [entry({ jump_height: '16', handler_id: 'person-2' })]
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
          { kind: 'withdrawn', entry_id: 'entry-1' },
          { ...move, to_class_id: 'class-1' },
        ],
        [entry({ jump_height: '12' }), entry({ id: 'entry-2' })]
      )
    );
    const { fetch, promise } = drain(fixture);
    await expect(promise).resolves.toMatchObject({ claimed: 1, sent: 0, skipped: 1 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('tells a withdrawal and a pull, and one line per entry for the worst outcome', async () => {
    const fixture = makeAutoSendSupabase(
      tables(
        [
          { kind: 'withdrawn', entry_id: 'entry-1' },
          { kind: 'removed', entry_id: 'entry-1' },
          { kind: 'pulled', entry_id: 'entry-2' },
        ],
        [
          entry({ entry_status: 'withdrawn', deleted_at: '2026-11-17T11:00:00Z' }),
          entry({ id: 'entry-2', class_id: 'class-2', check_in_status: 'pulled' }),
        ]
      )
    );
    const { fetch, promise } = drain(fixture);
    await promise;
    const { html } = sentBody(fetch);
    expect(html).toContain('withdrawn from Container Novice A');
    expect(html).toContain('pulled from Interior Novice A');
    expect(html).not.toContain('removed from');
  });

  it('says nothing about an entry the recipient no longer owns or handles', async () => {
    const fixture = makeAutoSendSupabase(
      tables(
        [{ kind: 'withdrawn', entry_id: 'entry-1' }],
        [entry({ entry_status: 'withdrawn', dogs: { ...dog, owner_id: 'someone-else' } })]
      )
    );
    const { promise } = drain(fixture);
    await expect(promise).resolves.toMatchObject({ sent: 0, skipped: 1 });
  });

  it('skips when the show is no longer published and records nothing as sent', async () => {
    const data = tables(
      [{ kind: 'withdrawn', entry_id: 'entry-1' }],
      [entry({ entry_status: 'withdrawn' })]
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
