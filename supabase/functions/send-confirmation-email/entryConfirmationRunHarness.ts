// The in-memory database and provider the full-confirmation run tests drive (MYK9-1999, 2088).
// No email leaves it. Test-only; kept beside the tests that import it.

import { vi } from 'vitest';

import type {
  ConfirmationLogRow,
  ConfirmationSendResult,
  EntryConfirmationDeps,
} from './entryConfirmationRun';
import {
  latestAcceptanceGenerations,
  showRegistry,
  type AcceptanceHistoryRow,
  type ConfirmationEntry,
  type ConfirmationRecipient,
  type ConfirmationShow,
} from './entryConfirmations';
import { renderConfirmationEmail } from './renderConfirmationEmail';

export const NOW = new Date('2026-11-20T15:00:00Z');
export const LONG_AGO = '2026-11-20T14:00:00Z';
export const DAY = 24 * 60 * 60 * 1000;

export interface StoredEntry extends ConfirmationEntry {
  entry_status: string;
  deleted_at: string | null;
  updated_at: string;
  confirmation_email_sent_at: string | null;
  confirmation_email_status: 'pending' | 'sent' | 'failed';
  confirmation_email_message_id: string | null;
  receipt_email_status: 'pending' | 'sent' | 'failed';
  /** MYK9-2088: the lease; null or in the past means claimable. */
  confirmation_claimed_until: string | null;
}

export function show(overrides: Partial<ConfirmationShow> = {}): ConfirmationShow {
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
export function resetEntrySeq() {
  seq = 0;
}
export function entry(overrides: Partial<StoredEntry> = {}): StoredEntry {
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
    confirmation_claimed_until: null,
    ...overrides,
  };
}

/** An in-memory database with the same filters the real queries apply. No email leaves it. */
export function makeDeps(args: {
  shows: ConfirmationShow[];
  entries: StoredEntry[];
  /** null: the registration was found with no person. */
  people?: Record<string, ConfirmationRecipient | null>;
  handlers?: Record<string, ConfirmationRecipient>;
  registrationsRead?: boolean;
  switchedOff?: string[];
  /** The candidate read's row limit (CONFIRMATION_ROW_LIMIT in production). */
  rowLimit?: number;
  sendResult?: () => ConfirmationSendResult;
  /** entry_status_history rows into 'confirmed'; the acceptance generation is the latest id. */
  history?: AcceptanceHistoryRow[];
  historyReadFails?: boolean;
  /** The stamp after the provider accepts cannot be written (database error). */
  markSentFails?: boolean;
}) {
  const people: Record<string, ConfirmationRecipient | null> = args.people ?? {
    'reg-ada': { email: 'ada@example.com', firstName: 'Ada', lastName: 'Lovelace' },
  };
  const sends: Array<{ to: string; subject: string; html: string; idempotencyKey: string }> = [];
  // What the provider has accepted, by Idempotency-Key: a repeat of a key is not a second delivery.
  const deliveries = new Map<string, string>();
  const logs: ConfirmationLogRow[] = [];
  let messageSeq = 0;
  let current = NOW;
  const advance = (ms: number) => {
    current = new Date(current.getTime() + ms);
  };
  const eligibleRows = ({
    showIds,
    statuses,
    quietSince,
    nowIso,
  }: {
    showIds: string[];
    statuses: string[];
    quietSince: string;
    nowIso: string;
  }) =>
    args.entries
      .filter(
        row =>
          showIds.includes(row.show_id) &&
          row.entry_status === 'confirmed' &&
          row.armband !== null &&
          row.deleted_at === null &&
          row.confirmation_email_sent_at === null &&
          (row.confirmation_claimed_until === null || row.confirmation_claimed_until < nowIso) &&
          (statuses as string[]).includes(row.confirmation_email_status) &&
          row.updated_at < quietSince
      )
      .sort((a, b) =>
        a.updated_at === b.updated_at
          ? a.id.localeCompare(b.id)
          : a.updated_at.localeCompare(b.updated_at)
      );
  const deps: EntryConfirmationDeps = {
    now: () => current,
    siteUrl: 'https://myk9show.com',
    loadShows: async () => args.shows,
    loadAcceptedEmailOff: async showIds =>
      new Set((args.switchedOff ?? []).filter(id => showIds.includes(id))),
    loadCandidates: async ({ showIds, statuses, quietSince, nowIso }) =>
      eligibleRows({ showIds, statuses, quietSince, nowIso }).slice(0, args.rowLimit ?? 500),
    loadExhibitorEntries: async ({
      showIds,
      registrationIds,
      handlerIds,
      statuses,
      quietSince,
      nowIso,
    }) =>
      eligibleRows({ showIds, statuses, quietSince, nowIso }).filter(row =>
        row.registration_id
          ? registrationIds.includes(row.registration_id)
          : !!row.handler_id && handlerIds.includes(row.handler_id)
      ),
    loadRecipients: async ({ registrationIds, handlerIds }) => ({
      byRegistration: new Map(
        args.registrationsRead === false
          ? []
          : registrationIds.flatMap(id => (id in people ? [[id, people[id]!] as const] : []))
      ),
      byHandler: new Map(
        handlerIds.flatMap(id => (args.handlers?.[id] ? [[id, args.handlers[id]!] as const] : []))
      ),
      registrationsRead: args.registrationsRead !== false,
      handlersRead: true,
    }),
    loadJudges: async classIds =>
      new Map(classIds.flatMap(id => (id === 'class-1' ? [[id, 'Dana Whitlock'] as const] : []))),
    loadConfirmationNumbers: async () => new Map([['reg-ada', 'CONF-1234']]),
    loadAcceptanceGenerations: async ids => {
      if (args.historyReadFails) throw new Error('history read failed');
      return latestAcceptanceGenerations(
        (args.history ?? []).filter(row => ids.includes(row.entry_id))
      );
    },
    claim: async (ids, statuses, nowIso, leaseUntilIso) => {
      const claimed: string[] = [];
      for (const row of args.entries) {
        if (
          ids.includes(row.id) &&
          row.confirmation_email_sent_at === null &&
          (row.confirmation_claimed_until === null || row.confirmation_claimed_until < nowIso) &&
          (statuses as string[]).includes(row.confirmation_email_status) &&
          row.entry_status === 'confirmed' &&
          row.armband !== null &&
          row.deleted_at === null
        ) {
          row.confirmation_claimed_until = leaseUntilIso;
          claimed.push(row.id);
        }
      }
      return claimed;
    },
    markSent: async (ids, messageId, leaseUntilIso) => {
      if (args.markSentFails) return [];
      const stamped: string[] = [];
      for (const row of args.entries.filter(item => ids.includes(item.id))) {
        if (row.confirmation_claimed_until !== leaseUntilIso || row.entry_status !== 'confirmed') {
          continue;
        }
        row.confirmation_email_sent_at = current.toISOString();
        row.confirmation_email_status = 'sent';
        row.confirmation_email_message_id = messageId;
        row.confirmation_claimed_until = null;
        stamped.push(row.id);
      }
      return stamped;
    },
    markFailed: async (ids, leaseUntilIso) => {
      for (const row of args.entries.filter(item => ids.includes(item.id))) {
        if (leaseUntilIso !== undefined && row.confirmation_claimed_until !== leaseUntilIso)
          continue;
        // The entries updated_at trigger: a failed attempt moves the group to the back.
        row.updated_at = current.toISOString();
        row.confirmation_claimed_until = null;
        row.confirmation_email_status = 'failed';
      }
    },
    render: (data, renderShow) =>
      renderConfirmationEmail(data, renderShow, showRegistry(renderShow)),
    send: vi.fn(async email => {
      sends.push(email);
      const result = args.sendResult?.();
      if (result) return result;
      // Resend: a repeated Idempotency-Key returns the first message, not a new delivery.
      const earlier = deliveries.get(email.idempotencyKey);
      if (earlier) return { ok: true as const, messageId: earlier };
      const messageId = `msg-${++messageSeq}`;
      deliveries.set(email.idempotencyKey, messageId);
      return { ok: true as const, messageId };
    }),
    log: async row => {
      logs.push(row);
    },
  };
  return { deps, sends, logs, advance, deliveries };
}
