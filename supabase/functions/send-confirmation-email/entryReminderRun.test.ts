// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runEntryReminders, type EntryReminderDeps, type ReminderLogRow } from './entryReminderRun';
import {
  showRegistry,
  type ConfirmationEntry,
  type ConfirmationRecipient,
  type ConfirmationShow,
} from './entryConfirmations';
import type { ConfirmationSendResult } from './entryConfirmationRun';
import {
  addCalendarDays,
  hourInZone,
  showReminderIsDue,
  withReminderStrip,
} from './entryReminders';
import { renderConfirmationEmail } from './renderConfirmationEmail';
import { EMAIL_STYLES } from './email-style-registry';

/** 09:30 in Chicago (UTC-6 in December) on 3 December: two days before a 5 December show. */
const REMINDER_MORNING = new Date('2026-12-03T15:30:00Z');

interface StoredEntry extends ConfirmationEntry {
  entry_status: string;
  deleted_at: string | null;
  reminder_email_sent_at: string | null;
  reminder_email_status: 'pending' | 'sent' | 'failed' | 'covered';
}

function show(overrides: Partial<ConfirmationShow> = {}): ConfirmationShow {
  return {
    id: 'show-1',
    name: 'Heartland Scent Work Classic',
    status: 'published',
    start_date: '2026-12-05',
    end_date: '2026-12-06',
    venue_name: 'Expo Hall',
    address: '1200 Fairgrounds Rd',
    city: 'Springfield',
    state: 'IL',
    zip_code: '62701',
    latitude: null,
    longitude: null,
    organization: 'Heartland Kennel Club',
    confirmation_message: 'Park in the north lot.',
    style: 'heritage',
    trials: [
      {
        id: 'trial-1',
        name: 'Saturday T1',
        trial_number: '1',
        date: '2026-12-05',
        timezone: 'America/Chicago',
        registry_id: 'AKC',
        planned_start_time: null,
      },
    ],
    ...overrides,
  };
}

let seq = 0;
function entry(overrides: Partial<StoredEntry> = {}): StoredEntry {
  seq++;
  return {
    id: `entry-${seq}`,
    show_id: 'show-1',
    trial_id: 'trial-1',
    class_id: `class-${seq}`,
    registration_id: 'reg-ada',
    handler_id: 'person-ada',
    dog_id: 'dog-vesper',
    armband: '101',
    entry_fee: 30,
    dog: { name: 'Vesper of Ridgeway', call_name: 'Vesper', breed: 'GSP', sex: 'F' },
    class: { name: 'Novice Interior', level: 'Novice', element: 'Interior' },
    entry_status: 'confirmed',
    deleted_at: null,
    reminder_email_sent_at: null,
    reminder_email_status: 'pending',
    ...overrides,
  };
}

function makeDeps(args: {
  now?: Date;
  shows: ConfirmationShow[];
  entries: StoredEntry[];
  people?: Record<string, ConfirmationRecipient | null>;
  sendResult?: () => ConfirmationSendResult;
}) {
  const people = args.people ?? {
    'reg-ada': { email: 'ada@example.com', firstName: 'Ada', lastName: 'Lovelace' },
    'reg-bo': { email: 'bo@example.com', firstName: 'Bo', lastName: 'Peep' },
  };
  const sends: Array<{ to: string; subject: string; html: string; idempotencyKey: string }> = [];
  const logs: ReminderLogRow[] = [];
  let messageSeq = 0;
  const deps: EntryReminderDeps = {
    now: () => args.now ?? REMINDER_MORNING,
    siteUrl: 'https://myk9show.com',
    loadShows: async () => args.shows,
    loadEntries: async (showIds, staleBeforeIso) =>
      args.entries.filter(
        row =>
          showIds.includes(row.show_id) &&
          row.entry_status === 'confirmed' &&
          row.deleted_at === null &&
          ['pending', 'failed'].includes(row.reminder_email_status) &&
          (row.reminder_email_sent_at === null ||
            (row.reminder_email_status === 'pending' &&
              row.reminder_email_sent_at < staleBeforeIso))
      ),
    loadSentEntries: async showIds =>
      args.entries.filter(
        row => showIds.includes(row.show_id) && row.reminder_email_status === 'sent'
      ),
    markCovered: async ids => {
      for (const row of args.entries.filter(item => ids.includes(item.id))) {
        row.reminder_email_status = 'covered';
      }
    },
    loadRecipients: async ({ registrationIds }) => ({
      byRegistration: new Map(
        registrationIds.flatMap(id => (id in people ? [[id, people[id]!] as const] : []))
      ),
      byHandler: new Map(),
      registrationsRead: true,
      handlersRead: true,
    }),
    loadJudges: async classIds =>
      new Map(classIds.flatMap(id => (id === 'class-1' ? [[id, 'Dana Whitlock'] as const] : []))),
    claim: async (ids, nowIso, staleBeforeIso) => {
      const claimed: string[] = [];
      for (const row of args.entries) {
        if (
          ids.includes(row.id) &&
          ['pending', 'failed'].includes(row.reminder_email_status) &&
          (row.reminder_email_sent_at === null ||
            (row.reminder_email_status === 'pending' &&
              row.reminder_email_sent_at < staleBeforeIso)) &&
          row.entry_status === 'confirmed' &&
          row.deleted_at === null
        ) {
          row.reminder_email_sent_at = nowIso;
          claimed.push(row.id);
        }
      }
      return claimed;
    },
    markSent: async ids => {
      for (const row of args.entries.filter(item => ids.includes(item.id))) {
        row.reminder_email_status = 'sent';
      }
    },
    markFailed: async ids => {
      for (const row of args.entries.filter(item => ids.includes(item.id))) {
        row.reminder_email_sent_at = null;
        row.reminder_email_status = 'failed';
      }
    },
    render: (data, renderShow) =>
      renderConfirmationEmail(data, renderShow, showRegistry(renderShow)),
    send: vi.fn(async email => {
      sends.push(email);
      return args.sendResult?.() ?? { ok: true as const, messageId: `msg-${++messageSeq}` };
    }),
    log: async row => {
      logs.push(row);
    },
  };
  return { deps, sends, logs };
}

beforeEach(() => {
  seq = 0;
});

describe('runEntryReminders (MYK9-2113)', () => {
  it('sends one reminder per exhibitor per show, however many dogs and classes', async () => {
    const entries = [
      entry({ dog_id: 'dog-vesper', armband: '101' }),
      entry({ dog_id: 'dog-vesper', armband: '101' }),
      entry({
        dog_id: 'dog-juno',
        armband: '102',
        dog: { name: 'Juno', call_name: 'Juno', breed: 'Lab', sex: 'F' },
      }),
      entry({ registration_id: 'reg-bo', handler_id: 'person-bo', armband: '201' }),
    ];
    const { deps, sends, logs } = makeDeps({ shows: [show()], entries });
    const result = await runEntryReminders(deps);

    expect(result).toEqual({ sent: 2, failed: 0, skipped: 0, deferred: 0 });
    expect(sends.map(email => email.to).sort()).toEqual(['ada@example.com', 'bo@example.com']);
    const ada = sends.find(email => email.to === 'ada@example.com')!;
    expect(ada.subject).toBe('Reminder: Heartland Scent Work Classic starts in two days');
    expect(ada.html).toContain('101');
    expect(ada.html).toContain('102');
    expect(ada.html).toContain('Vesper');
    expect(ada.html).toContain('Juno');
    expect(ada.html).toContain('1200 Fairgrounds Rd, Springfield, IL 62701');
    expect(ada.html).toContain('href="https://myk9show.com/exhibitor/entries"');
    expect(logs).toHaveLength(2);
    expect(logs[0]).toMatchObject({
      email_type: 'show_reminder',
      show_id: 'show-1',
      status: 'sent',
      error_message: null,
    });
  });

  it('is recorded against the show, and a second run the same morning sends nothing', async () => {
    const entries = [entry()];
    const { deps, sends } = makeDeps({ shows: [show()], entries });
    await runEntryReminders(deps);
    const again = await runEntryReminders(deps);

    expect(sends).toHaveLength(1);
    expect(again.sent).toBe(0);
    expect(entries[0]).toMatchObject({ reminder_email_status: 'sent' });
    expect(entries[0]!.reminder_email_sent_at).toBe(REMINDER_MORNING.toISOString());
  });

  it('prints the note when the show has one and omits it when empty', async () => {
    const withNote = makeDeps({ shows: [show()], entries: [entry()] });
    await runEntryReminders(withNote.deps);
    expect(withNote.sends[0]!.html).toContain('Note from the show secretary');
    expect(withNote.sends[0]!.html).toContain('Park in the north lot.');

    for (const empty of [null, '', '   ']) {
      const without = makeDeps({
        shows: [show({ confirmation_message: empty })],
        entries: [entry()],
      });
      await runEntryReminders(without.deps);
      expect(without.sends[0]!.html).not.toContain('Note from the show secretary');
    }
  });

  it('shows a start time only on a day that has one', async () => {
    const timed = show({
      trials: [
        {
          id: 'trial-1',
          name: 'Saturday T1',
          trial_number: '1',
          date: '2026-12-05',
          timezone: 'America/Chicago',
          registry_id: 'AKC',
          planned_start_time: '8:30 AM',
        },
      ],
    });
    const withTime = makeDeps({ shows: [timed], entries: [entry()] });
    await runEntryReminders(withTime.deps);
    expect(withTime.sends[0]!.html).toContain('8:30 AM');

    const without = makeDeps({ shows: [show()], entries: [entry()] });
    await runEntryReminders(without.deps);
    expect(without.sends[0]!.html).not.toMatch(/\d:\d\d\s?[AP]M/i);
  });

  it('sends nothing for a cancelled show, a draft or a deleted one', async () => {
    for (const status of ['cancelled', 'draft', 'completed']) {
      const { deps, sends } = makeDeps({ shows: [show({ status })], entries: [entry()] });
      expect(await runEntryReminders(deps)).toEqual({
        sent: 0,
        failed: 0,
        skipped: 0,
        deferred: 0,
      });
      expect(sends).toHaveLength(0);
    }
  });

  it('sends nothing to an exhibitor whose entries were all pulled, withdrawn or deleted', async () => {
    const entries = [
      entry({ entry_status: 'pulled' }),
      entry({ entry_status: 'withdrawn' }),
      entry({ deleted_at: '2026-12-01T00:00:00Z' }),
    ];
    const { deps, sends } = makeDeps({ shows: [show()], entries });
    await runEntryReminders(deps);
    expect(sends).toHaveLength(0);
  });

  it('names only the live entries when she pulled one of two', async () => {
    const entries = [
      entry({ armband: '101' }),
      entry({
        armband: '777',
        entry_status: 'pulled',
        dog: { name: 'Gone', call_name: 'Gone', breed: 'Lab', sex: 'M' },
      }),
    ];
    const { deps, sends } = makeDeps({ shows: [show()], entries });
    await runEntryReminders(deps);
    expect(sends).toHaveLength(1);
    expect(sends[0]!.html).not.toContain('777');
  });

  it('sends nothing more to an exhibitor accepted late after her reminder went, and marks it covered', async () => {
    const entries = [entry({ armband: '101' }), entry({ armband: '102' })];
    const { deps, sends } = makeDeps({ shows: [show()], entries });
    await runEntryReminders(deps);
    expect(sends).toHaveLength(1);

    const late = entry({ armband: '103' });
    entries.push(late);
    const next = await runEntryReminders(deps);

    expect(sends).toHaveLength(1);
    expect(next.sent).toBe(0);
    expect(late.reminder_email_status).toBe('covered');
    expect(late.reminder_email_sent_at).toBeNull();
    // A covered entry is never looked at again.
    await runEntryReminders(deps);
    expect(sends).toHaveLength(1);
  });

  it('retries a claim a crashed run left pending for over 30 minutes, and not a fresh one', async () => {
    const fresh = entry({
      reminder_email_sent_at: '2026-12-03T15:10:00Z',
      reminder_email_status: 'pending',
    });
    const first = makeDeps({ shows: [show()], entries: [fresh] });
    await runEntryReminders(first.deps);
    expect(first.sends).toHaveLength(0);

    const stale = entry({
      reminder_email_sent_at: '2026-12-03T14:41:00Z',
      reminder_email_status: 'pending',
    });
    const second = makeDeps({ shows: [show()], entries: [stale] });
    await runEntryReminders(second.deps);
    expect(second.sends).toHaveLength(1);
    expect(stale.reminder_email_status).toBe('sent');
  });

  it('never sends again an entry that already had its reminder', async () => {
    const entries = [
      entry({ reminder_email_sent_at: '2026-12-03T14:41:00Z', reminder_email_status: 'sent' }),
    ];
    const { deps, sends } = makeDeps({ shows: [show()], entries });
    await runEntryReminders(deps);
    expect(sends).toHaveLength(0);
  });

  it('releases a failed send, logs it, and the next hour sends it', async () => {
    let fail = true;
    const entries = [entry()];
    const { deps, sends, logs } = makeDeps({
      shows: [show()],
      entries,
      sendResult: () =>
        fail
          ? { ok: false, error: 'provider_http_500' }
          : { ok: true as const, messageId: 'msg-retry' },
    });
    expect(await runEntryReminders(deps)).toMatchObject({ sent: 0, failed: 1 });
    expect(entries[0]).toMatchObject({
      reminder_email_sent_at: null,
      reminder_email_status: 'failed',
    });
    expect(logs[0]).toMatchObject({ status: 'failed', error_message: 'provider_http_500' });

    fail = false;
    expect(await runEntryReminders(deps)).toMatchObject({ sent: 1, failed: 0 });
    expect(sends).toHaveLength(2);
    expect(sends[1]!.idempotencyKey).toBe(sends[0]!.idempotencyKey);
  });

  it('logs a missing address once, not every hour', async () => {
    const entries = [entry()];
    const { deps, sends, logs } = makeDeps({
      shows: [show()],
      entries,
      people: { 'reg-ada': { email: null, firstName: 'Ada', lastName: 'Lovelace' } },
    });
    await runEntryReminders(deps);
    await runEntryReminders(deps);
    expect(sends).toHaveLength(0);
    expect(logs).toEqual([
      expect.objectContaining({ status: 'failed', error_message: 'missing_recipient' }),
    ]);
  });

  it('carries the reminder strip in every one of the eight styles', async () => {
    for (const style of EMAIL_STYLES) {
      const { deps, sends } = makeDeps({ shows: [show({ style })], entries: [entry()] });
      await runEntryReminders(deps);
      expect(sends[0]!.html, style).toContain('starts in two days');
      expect(sends[0]!.html, style).toContain('Park in the north lot.');
    }
  });
});

describe('when a show is due (MYK9-2113)', () => {
  const at = (iso: string) => new Date(iso);

  it('is due only on the day two days before the first day, in the show zone', () => {
    // 5 December first day, Chicago: due on 3 December, 08:00 to 11:59 local (14:00Z to 17:59Z).
    expect(showReminderIsDue(show(), at('2026-12-03T15:30:00Z'))).toBe(true);
    expect(showReminderIsDue(show(), at('2026-12-02T15:30:00Z'))).toBe(false);
    expect(showReminderIsDue(show(), at('2026-12-04T15:30:00Z'))).toBe(false);
    expect(showReminderIsDue(show(), at('2026-12-05T15:30:00Z'))).toBe(false);
  });

  it('sends in the morning only, and never on a later day', () => {
    expect(showReminderIsDue(show(), at('2026-12-03T13:59:00Z'))).toBe(false);
    expect(showReminderIsDue(show(), at('2026-12-03T14:00:00Z'))).toBe(true);
    expect(showReminderIsDue(show(), at('2026-12-03T17:59:00Z'))).toBe(true);
    expect(showReminderIsDue(show(), at('2026-12-03T18:00:00Z'))).toBe(false);
  });

  it('reads the day in the show zone, not the server zone: Pacific at 23:30 UTC', () => {
    const pacific = show({
      trials: [{ ...show().trials[0]!, timezone: 'America/Los_Angeles' }],
    });
    // 23:30Z on 3 December is 15:30 on 3 December in Los Angeles: the right day, past the window.
    expect(showReminderIsDue(pacific, at('2026-12-03T23:30:00Z'))).toBe(false);
    // 23:30Z on 2 December is 15:30 on 2 December there: the day before, so nothing.
    expect(showReminderIsDue(pacific, at('2026-12-02T23:30:00Z'))).toBe(false);
    // 04:30Z on 3 December is still the evening of 2 December there: nothing.
    expect(showReminderIsDue(pacific, at('2026-12-03T04:30:00Z'))).toBe(false);
    // 17:30Z on 3 December is 09:30 there: due.
    expect(showReminderIsDue(pacific, at('2026-12-03T17:30:00Z'))).toBe(true);
  });

  it('is due on a calendar day the server has not reached: Auckland is ahead of UTC', () => {
    const auckland = show({
      trials: [{ ...show().trials[0]!, timezone: 'Pacific/Auckland' }],
    });
    // 20:30Z on 2 December is 09:30 on 3 December in Auckland (UTC+13 in summer): due.
    expect(showReminderIsDue(auckland, at('2026-12-02T20:30:00Z'))).toBe(true);
    // The same instant read in UTC would be the 2nd: Chicago's show is not due then.
    expect(showReminderIsDue(show(), at('2026-12-02T20:30:00Z'))).toBe(false);
  });

  it('counts two days across a month end', () => {
    expect(addCalendarDays('2026-12-01', -2)).toBe('2026-11-29');
    expect(addCalendarDays('2027-01-01', -2)).toBe('2026-12-30');
    expect(hourInZone(at('2026-12-03T15:30:00Z'), 'America/Chicago')).toBe(9);
  });
});

describe('withReminderStrip', () => {
  it('escapes the show title and places the strip first in the body', () => {
    const html = withReminderStrip(
      '<html><body class="x"><p>Hi</p></body></html>',
      '<b>Show</b>',
      '5 Dec'
    );
    expect(html).toContain('&lt;b&gt;Show&lt;/b&gt;');
    expect(html.indexOf('Reminder:')).toBeLessThan(html.indexOf('<p>Hi</p>'));
  });
});
