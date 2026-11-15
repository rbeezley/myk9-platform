// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  runEntryConfirmations,
  type ConfirmationLogRow,
  type ConfirmationSendResult,
  type EntryConfirmationDeps,
} from './entryConfirmationRun';
import {
  showRegistry,
  type ConfirmationEntry,
  type ConfirmationRecipient,
  type ConfirmationShow,
} from './entryConfirmations';
import { renderConfirmationEmail } from './renderConfirmationEmail';

const NOW = new Date('2026-11-20T15:00:00Z');
const LONG_AGO = '2026-11-20T14:00:00Z';

interface StoredEntry extends ConfirmationEntry {
  entry_status: string;
  deleted_at: string | null;
  updated_at: string;
  confirmation_email_sent_at: string | null;
  confirmation_email_status: 'pending' | 'sent' | 'failed';
  confirmation_email_message_id: string | null;
  receipt_email_status: 'pending' | 'sent' | 'failed';
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
    updated_at: LONG_AGO,
    confirmation_email_sent_at: null,
    confirmation_email_status: 'pending',
    confirmation_email_message_id: null,
    receipt_email_status: 'pending',
    ...overrides,
  };
}

/** An in-memory database with the same filters the real queries apply. No email leaves it. */
function makeDeps(args: {
  shows: ConfirmationShow[];
  entries: StoredEntry[];
  people?: Record<string, ConfirmationRecipient>;
  sendResult?: () => ConfirmationSendResult;
}) {
  const people: Record<string, ConfirmationRecipient> = args.people ?? {
    'reg-ada': { email: 'ada@example.com', firstName: 'Ada', lastName: 'Lovelace' },
  };
  const sends: Array<{ to: string; subject: string; html: string; idempotencyKey: string }> = [];
  const logs: ConfirmationLogRow[] = [];
  let messageSeq = 0;
  const deps: EntryConfirmationDeps = {
    now: () => NOW,
    siteUrl: 'https://myk9show.com',
    loadShows: async () => args.shows,
    loadCandidates: async ({ showIds, statuses, quietSince }) =>
      args.entries.filter(
        row =>
          showIds.includes(row.show_id) &&
          row.entry_status === 'confirmed' &&
          row.armband !== null &&
          row.deleted_at === null &&
          row.confirmation_email_sent_at === null &&
          (statuses as string[]).includes(row.confirmation_email_status) &&
          row.updated_at < quietSince
      ),
    loadRecipients: async ({ registrationIds }) => ({
      byRegistration: new Map(
        registrationIds.flatMap(id => (people[id] ? [[id, people[id]!] as const] : []))
      ),
      byHandler: new Map(),
    }),
    loadJudges: async classIds =>
      new Map(classIds.flatMap(id => (id === 'class-1' ? [[id, 'Dana Whitlock'] as const] : []))),
    loadConfirmationNumbers: async () => new Map([['reg-ada', 'CONF-1234']]),
    claim: async (ids, statuses, nowIso) => {
      const claimed: string[] = [];
      for (const row of args.entries) {
        if (
          ids.includes(row.id) &&
          row.confirmation_email_sent_at === null &&
          (statuses as string[]).includes(row.confirmation_email_status) &&
          row.entry_status === 'confirmed' &&
          row.armband !== null &&
          row.deleted_at === null
        ) {
          row.confirmation_email_sent_at = nowIso;
          claimed.push(row.id);
        }
      }
      return claimed;
    },
    markSent: async (ids, messageId) => {
      for (const row of args.entries.filter(item => ids.includes(item.id))) {
        row.confirmation_email_status = 'sent';
        row.confirmation_email_message_id = messageId;
      }
    },
    markFailed: async ids => {
      for (const row of args.entries.filter(item => ids.includes(item.id))) {
        row.confirmation_email_sent_at = null;
        row.confirmation_email_status = 'failed';
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

describe('runEntryConfirmations (MYK9-1999)', () => {
  it('sends one email per exhibitor per show, not one per dog or class, and only once', async () => {
    const entries = [
      entry(),
      entry({ class: { name: 'Novice Exterior', level: 'Novice', element: 'Exterior' } }),
      entry({
        dog_id: 'dog-juno',
        armband: '102',
        dog: { name: 'Juno', call_name: 'Juno', breed: 'Lab', sex: 'F' },
      }),
      entry({
        dog_id: 'dog-pip',
        armband: '103',
        dog: { name: 'Pip', call_name: 'Pip', breed: 'Mutt', sex: 'M' },
      }),
    ];
    const { deps, sends, logs } = makeDeps({ shows: [show()], entries });

    expect(await runEntryConfirmations(deps, 'new')).toEqual({ sent: 1, failed: 0, deferred: 0 });
    expect(await runEntryConfirmations(deps, 'new')).toEqual({ sent: 0, failed: 0, deferred: 0 });
    expect(await runEntryConfirmations(deps, 'all')).toEqual({ sent: 0, failed: 0, deferred: 0 });

    expect(sends).toHaveLength(1);
    expect(sends[0]).toMatchObject({
      to: 'ada@example.com',
      subject: 'Your entries to Heartland Scent Work Classic are accepted',
    });
    for (const text of ['Vesper', 'Juno', 'Pip', '101', '102', '103', 'Dana Whitlock']) {
      expect(sends[0]!.html).toContain(text);
    }
    expect(entries.every(row => row.confirmation_email_status === 'sent')).toBe(true);
    expect(logs).toEqual([
      {
        recipient_email: 'ada@example.com',
        email_type: 'heritage_confirmation',
        related_id: 'entry-1',
        show_id: 'show-1',
        resend_message_id: 'msg-1',
        status: 'sent',
        error_message: null,
      },
    ]);
  });

  it('carries the armband, judge, street address with directions, the note and a link to My Shows', async () => {
    const { deps, sends } = makeDeps({ shows: [show()], entries: [entry()] });
    await runEntryConfirmations(deps, 'new');

    const html = sends[0]!.html;
    expect(sends[0]!.subject).toBe('Your entry to Heartland Scent Work Classic is accepted');
    expect(html).toContain('101');
    expect(html).toContain('Dana Whitlock');
    expect(html).toContain('1200 Fairgrounds Rd, Springfield, IL 62701');
    expect(html).toContain('Get directions');
    expect(html).toContain('Note from the show secretary');
    expect(html).toContain('Park in the north lot.');
    expect(html).toContain('href="https://myk9show.com/exhibitor/entries"');
    expect(html).toContain('CONF-1234');
  });

  it('gives an entry accepted after her email went out an email of its own', async () => {
    const first = entry();
    const later = entry({ entry_status: 'paid', armband: null });
    const entries = [first, later];
    const { deps, sends } = makeDeps({ shows: [show()], entries });

    await runEntryConfirmations(deps, 'new');
    later.entry_status = 'confirmed';
    later.armband = '101';
    await runEntryConfirmations(deps, 'new');
    await runEntryConfirmations(deps, 'new');

    expect(sends).toHaveLength(2);
    expect(sends[1]!.subject).toBe('Your entry to Heartland Scent Work Classic is accepted');
    expect(sends[1]!.idempotencyKey).not.toBe(sends[0]!.idempotencyKey);
  });

  it('confirms a card entry whose receipt already went, the same as a mail-in one', async () => {
    const entries = [entry({ receipt_email_status: 'sent' })];
    const { deps, sends } = makeDeps({ shows: [show()], entries });
    await runEntryConfirmations(deps, 'new');
    expect(sends).toHaveLength(1);
  });

  it('waits for an accepted entry to go quiet, so an Accept she undoes is not emailed', async () => {
    const entries = [entry({ updated_at: '2026-11-20T14:58:00Z' })];
    const { deps, sends } = makeDeps({ shows: [show()], entries });
    await runEntryConfirmations(deps, 'new');
    expect(sends).toHaveLength(0);
  });

  it('sends nothing for an entry not yet accepted, one with no armband, or a deleted one', async () => {
    const entries = [
      entry({ entry_status: 'paid' }),
      entry({ entry_status: 'submitted' }),
      entry({ armband: null }),
      entry({ deleted_at: '2026-11-19T00:00:00Z' }),
    ];
    const { deps, sends } = makeDeps({ shows: [show()], entries });
    await runEntryConfirmations(deps, 'all');
    expect(sends).toHaveLength(0);
  });

  it('sends nothing for a show that is not published, is cancelled, or is over in its own time zone', async () => {
    for (const candidate of [
      show({ status: 'draft' }),
      show({ status: 'cancelled' }),
      show({ status: 'completed' }),
      // 15:00 UTC on Nov 20 is still Nov 20 in Chicago: a show that ended Nov 19 is over.
      show({ start_date: '2026-11-19', end_date: '2026-11-19' }),
    ]) {
      const { deps, sends } = makeDeps({ shows: [candidate], entries: [entry()] });
      await runEntryConfirmations(deps, 'all');
      expect(sends, candidate.status ?? '').toHaveLength(0);
    }
  });

  it('still sends on the last day of a show in a zone behind UTC', async () => {
    const lateNight = new Date('2026-11-21T03:00:00Z'); // 9 PM Nov 20 in Chicago
    const { deps, sends } = makeDeps({
      shows: [show({ start_date: '2026-11-20', end_date: '2026-11-20' })],
      entries: [entry()],
    });
    deps.now = () => lateNight;
    await runEntryConfirmations(deps, 'new');
    expect(sends).toHaveLength(1);
  });

  it('releases a failed send for the daily run, which retries it with the same key', async () => {
    let fail = true;
    const entries = [entry()];
    const { deps, sends, logs } = makeDeps({
      shows: [show()],
      entries,
      sendResult: () =>
        fail ? { ok: false, error: 'provider_http_500' } : { ok: true, messageId: 'msg-ok' },
    });

    expect(await runEntryConfirmations(deps, 'new')).toMatchObject({ sent: 0, failed: 1 });
    expect(entries[0]).toMatchObject({
      confirmation_email_sent_at: null,
      confirmation_email_status: 'failed',
    });
    await runEntryConfirmations(deps, 'new');
    expect(sends).toHaveLength(1);

    fail = false;
    expect(await runEntryConfirmations(deps, 'all')).toMatchObject({ sent: 1, failed: 0 });
    expect(sends).toHaveLength(2);
    expect(sends[1]!.idempotencyKey).toBe(sends[0]!.idempotencyKey);
    expect(logs.map(row => [row.status, row.error_message, row.show_id])).toEqual([
      ['failed', 'provider_http_500', 'show-1'],
      ['sent', null, 'show-1'],
    ]);
  });

  it('sends nothing to an exhibitor with no email address, and says so in Delivery history', async () => {
    const entries = [entry()];
    const { deps, sends, logs } = makeDeps({ shows: [show()], entries, people: {} });
    expect(await runEntryConfirmations(deps, 'new')).toMatchObject({ sent: 0, failed: 1 });
    expect(sends).toHaveLength(0);
    expect(logs).toEqual([
      expect.objectContaining({
        recipient_email: null,
        status: 'failed',
        error_message: 'missing_recipient',
        show_id: 'show-1',
      }),
    ]);
    // The frequent run does not log it again; the daily run looks once a day.
    await runEntryConfirmations(deps, 'new');
    expect(logs).toHaveLength(1);
  });

  it('emails two exhibitors in one show separately', async () => {
    const entries = [entry(), entry({ registration_id: 'reg-bea', handler_id: 'person-bea' })];
    const { deps, sends } = makeDeps({
      shows: [show()],
      entries,
      people: {
        'reg-ada': { email: 'ada@example.com', firstName: 'Ada', lastName: null },
        'reg-bea': { email: 'bea@example.com', firstName: 'Bea', lastName: null },
      },
    });
    await runEntryConfirmations(deps, 'new');
    expect(sends.map(email => email.to).sort()).toEqual(['ada@example.com', 'bea@example.com']);
  });

  it('never calls a UKC or ASCA club a member club of the American Kennel Club', async () => {
    for (const registry of ['UKC', 'ASCA']) {
      for (const style of ['heritage', 'poster', 'gazette', 'magazine', 'monogram']) {
        const ukc = show({ style, trials: [{ ...show().trials[0]!, registry_id: registry }] });
        const { deps, sends } = makeDeps({ shows: [ukc], entries: [entry()] });
        seq = 0;
        await runEntryConfirmations(deps, 'new');
        expect(sends[0]!.html, `${registry} ${style}`).not.toContain('American Kennel Club');
        expect(sends[0]!.html, `${registry} ${style}`).not.toContain('A.K.C.');
        expect(sends[0]!.html, `${registry} ${style}`).not.toContain('AKC');
      }
    }
  });
});
