// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  sendDueFullConfirmations,
  type ConfirmationPerson,
  type ConfirmationShowFacts,
  type ConfirmationShowRow,
  type EmailLogInput,
  type FullConfirmationDeps,
  type FullConfirmationStore,
} from './fullConfirmationSender';
import type { ConfirmationEntryRow } from './fullConfirmation';

const SHOW: ConfirmationShowRow = {
  id: 'show-1',
  name: 'Heartland Scent Work Classic',
  status: 'published',
  deleted_at: null,
  start_date: '2026-12-05',
  end_date: '2026-12-06',
  venue_name: 'Fairgrounds Hall',
  address: '1200 Fairgrounds Rd',
  city: 'Springfield',
  state: 'IL',
  zip_code: '62701',
  latitude: null,
  longitude: null,
  organization: 'Heartland Dog Club',
  style: 'heritage',
  confirmation_message: 'Park in the north lot. Crates in the barn.',
  experience_published_style: null,
};

let nextId = 0;
function entry(overrides: Partial<ConfirmationEntryRow> = {}): ConfirmationEntryRow {
  nextId += 1;
  return {
    id: `entry-${String(nextId).padStart(3, '0')}`,
    show_id: 'show-1',
    class_id: 'class-int',
    trial_id: 'trial-1',
    registration_id: null,
    armband: '142',
    entry_fee: 30,
    entry_status: 'confirmed',
    check_in_status: null,
    confirmation_email_sent_at: null,
    confirmation_email_status: 'pending',
    dog: { name: 'Vesper', call_name: null, breed: null, sex: null, owner_id: 'person-ada' },
    class: { name: 'Novice Interior', level: null, element: null },
    registration: null,
    ...overrides,
  };
}

interface Sent {
  to: string;
  subject: string;
  html: string;
  key: string;
}

function harness(options: {
  entries: ConfirmationEntryRow[];
  show?: Partial<ConfirmationShowRow>;
  registryId?: string;
  people?: Record<string, ConfirmationPerson>;
  failSends?: number;
}) {
  const entries = options.entries;
  const logs: EmailLogInput[] = [];
  const sent: Sent[] = [];
  let failuresLeft = options.failSends ?? 0;
  const people: Record<string, ConfirmationPerson> = options.people ?? {
    'person-ada': { first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.test' },
  };
  const byId = (ids: string[]) => entries.filter(row => ids.includes(row.id));

  const store: FullConfirmationStore = {
    listDueEntries: async () =>
      entries.filter(
        row => !row.confirmation_email_sent_at && row.confirmation_email_status === 'pending'
      ),
    loadShowFacts: async (): Promise<ConfirmationShowFacts> => ({
      show: { ...SHOW, ...options.show },
      trials: [
        {
          id: 'trial-1',
          name: 'Saturday',
          trial_number: '1',
          date: '2026-12-05',
          registry_id: options.registryId ?? 'AKC',
        },
      ],
      entries,
      judgesByClass: new Map([
        ['class-int', 'Dana Whitlock'],
        ['class-ext', 'Lee Okafor'],
      ]),
      confirmationNumbers: new Map(),
    }),
    loadPerson: async id => people[id] ?? null,
    claim: async (ids, nowIso) => {
      const claimed = byId(ids).filter(
        row => !row.confirmation_email_sent_at && row.confirmation_email_status === 'pending'
      );
      for (const row of claimed) row.confirmation_email_sent_at = nowIso;
      return claimed.map(row => row.id);
    },
    markSent: async ids => {
      for (const row of byId(ids)) row.confirmation_email_status = 'sent';
    },
    release: async ids => {
      for (const row of byId(ids)) row.confirmation_email_sent_at = null;
    },
    markUndeliverable: async ids => {
      for (const row of byId(ids)) row.confirmation_email_status = 'failed';
    },
    logEmail: async row => {
      logs.push(row);
    },
  };

  const deps: FullConfirmationDeps = {
    store,
    siteUrl: 'https://myk9show.com',
    now: () => new Date('2026-11-20T10:00:00Z'),
    send: async (email, key) => {
      if (failuresLeft > 0) {
        failuresLeft -= 1;
        return { ok: false, error: 'provider_http_500' };
      }
      sent.push({ ...email, key });
      return { ok: true, messageId: `msg-${sent.length}` };
    },
  };
  return { deps, sent, logs, entries };
}

describe('sendDueFullConfirmations (MYK9-1999)', () => {
  it('sends one email per exhibitor per show however many dogs and classes, and only once', async () => {
    const { deps, sent, logs } = harness({
      entries: [
        entry(),
        entry({ class_id: 'class-ext', class: { name: 'Novice Exterior' } }),
        entry({
          armband: '143',
          dog: { name: 'Juniper', owner_id: 'person-ada' },
        }),
      ],
    });

    expect(await sendDueFullConfirmations(deps)).toEqual({ sent: 1, failed: 0, skipped: 0 });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe('ada@example.test');
    expect(sent[0]?.html).toContain('Juniper: Novice Interior');
    expect(sent[0]?.html).toContain('Vesper: Novice Exterior');

    // The next scheduled run finds nothing due.
    expect(await sendDueFullConfirmations(deps)).toEqual({ sent: 0, failed: 0, skipped: 0 });
    expect(sent).toHaveLength(1);
    expect(logs.filter(log => log.status === 'sent')).toHaveLength(1);
  });

  it('carries the armband, judge, classes, street address, directions, the note and My Shows', async () => {
    const { deps, sent, logs } = harness({ entries: [entry()] });
    await sendDueFullConfirmations(deps);
    const html = sent[0]?.html ?? '';
    expect(html).toContain('142');
    expect(html).toContain('Dana Whitlock');
    expect(html).toContain('Novice Interior');
    expect(html).toContain('1200 Fairgrounds Rd, Springfield, IL 62701');
    expect(html).toContain('Get directions');
    expect(html).toContain('Park in the north lot. Crates in the barn.');
    expect(html).toContain('href="https://myk9show.com/exhibitor/entries"');
    // Recorded against its show, with what it said, for Delivery history.
    expect(logs[0]).toMatchObject({
      showId: 'show-1',
      status: 'sent',
      subject: 'Your entry to Heartland Scent Work Classic is confirmed',
    });
    expect(logs[0]?.bodyHtml).toBe(html);
  });

  it('confirms a card entry and a mail-in entry alike, each to the person who entered', async () => {
    const { deps, sent } = harness({
      entries: [
        entry(),
        entry({
          registration_id: 'reg-bo',
          registration: { handler_id: 'person-bo' },
          dog: { name: 'Rocket', owner_id: 'person-bo' },
        }),
      ],
      people: {
        'person-ada': { first_name: 'Ada', last_name: null, email: 'ada@example.test' },
        'person-bo': { first_name: 'Bo', last_name: null, email: 'bo@example.test' },
      },
    });
    await sendDueFullConfirmations(deps);
    expect(sent.map(email => email.to).sort()).toEqual(['ada@example.test', 'bo@example.test']);
  });

  it('sends a second full confirmation for an entry accepted after her first one went', async () => {
    const { deps, sent, entries } = harness({ entries: [entry()] });
    await sendDueFullConfirmations(deps);
    entries.push(entry({ class_id: 'class-ext', class: { name: 'Novice Exterior' } }));

    await sendDueFullConfirmations(deps);

    expect(sent).toHaveLength(2);
    expect(sent[1]?.key).not.toBe(sent[0]?.key);
    // The second lists everything she now has, not only the new class.
    expect(sent[1]?.html).toContain('Novice Interior');
    expect(sent[1]?.html).toContain('Novice Exterior');
  });

  it('waits for acceptance and the armband, and leaves out pulled entries', async () => {
    const { deps, sent } = harness({
      entries: [
        entry({ entry_status: 'paid' }),
        entry({ armband: null }),
        entry({ check_in_status: 'pulled' }),
      ],
    });
    expect(await sendDueFullConfirmations(deps)).toEqual({ sent: 0, failed: 0, skipped: 0 });
    expect(sent).toHaveLength(0);
  });

  it('sends nothing for a cancelled, draft or finished show', async () => {
    for (const show of [
      { status: 'cancelled' },
      { status: 'draft' },
      { start_date: '2026-11-01', end_date: '2026-11-02' },
    ]) {
      const { deps, sent } = harness({ entries: [entry()], show });
      expect((await sendDueFullConfirmations(deps)).skipped).toBe(1);
      expect(sent).toHaveLength(0);
    }
  });

  it('retries a failed send on the next run under the same key, and never sends twice', async () => {
    const { deps, sent, logs } = harness({ entries: [entry()], failSends: 1 });
    expect((await sendDueFullConfirmations(deps)).failed).toBe(1);
    expect(logs[0]).toMatchObject({ status: 'failed', errorMessage: 'provider_http_500' });

    expect((await sendDueFullConfirmations(deps)).sent).toBe(1);
    expect((await sendDueFullConfirmations(deps)).sent).toBe(0);
    expect(sent).toHaveLength(1);
  });

  it('records an exhibitor with no email address once, and does not try again every hour', async () => {
    const { deps, sent, logs } = harness({
      entries: [entry()],
      people: { 'person-ada': { first_name: 'Ada', last_name: null, email: null } },
    });
    await sendDueFullConfirmations(deps);
    await sendDueFullConfirmations(deps);
    expect(sent).toHaveLength(0);
    expect(logs).toEqual([expect.objectContaining({ errorMessage: 'missing_recipient' })]);
  });

  it('never names the American Kennel Club on a UKC or ASCA show', async () => {
    for (const registryId of ['UKC', 'ASCA']) {
      for (const style of ['heritage', 'poster', 'banner', 'magazine']) {
        const { deps, sent } = harness({ entries: [entry()], registryId, show: { style } });
        await sendDueFullConfirmations(deps);
        expect(sent[0]?.html, `${registryId} ${style}`).not.toContain('American Kennel Club');
        expect(sent[0]?.html, `${registryId} ${style}`).not.toContain('A.K.C.');
      }
    }
    const { deps, sent } = harness({ entries: [entry()] });
    await sendDueFullConfirmations(deps);
    expect(sent[0]?.html).toContain('A member club of the American Kennel Club');
  });
});
