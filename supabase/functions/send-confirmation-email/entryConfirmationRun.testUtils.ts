// An in-memory database for the confirmation run tests (MYK9-1999, MYK9-2088): the same filters
// the real queries apply, and a job store whose lease, one-ready-job-per-exhibitor rule and
// idempotent provider mirror the database and Resend. No email leaves it.
import { vi } from 'vitest';

import type {
  ConfirmationJob,
  ConfirmationJobAttempt,
  ConfirmationJobStore,
  EnqueueOutcome,
} from './entryConfirmationJobs';
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
    ...overrides,
  };
}

export interface FakeJobRow {
  id: string;
  show_id: string;
  group_key: string;
  entry_ids: string[];
  recipient_email: string;
  subject: string;
  html: string;
  idempotency_key: string;
  status: 'ready' | 'sent' | 'failed' | 'skipped';
  due_at: string;
  claimed_until: string | null;
  attempt_id: string | null;
  email_log_id: string | null;
}

export interface FakeAttempt extends ConfirmationJobAttempt {
  jobId: string;
}

export interface FakeDepsArgs {
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
}

/** A job the database holds, with the lease and attempt rows the real tables carry. */
export function makeDeps(args: FakeDepsArgs) {
  const people: Record<string, ConfirmationRecipient | null> = args.people ?? {
    'reg-ada': { email: 'ada@example.com', firstName: 'Ada', lastName: 'Lovelace' },
  };
  const sends: Array<{ to: string; subject: string; html: string; idempotencyKey: string }> = [];
  /** What the provider actually delivered: one message per Idempotency-Key. */
  const deliveries = new Map<string, string>();
  const logs: ConfirmationLogRow[] = [];
  const jobRows: FakeJobRow[] = [];
  const attempts: FakeAttempt[] = [];
  let messageSeq = 0;
  let idSeq = 0;
  let current = NOW;
  const advance = (ms: number) => {
    current = new Date(current.getTime() + ms);
  };
  const eligibleRows = ({
    showIds,
    statuses,
    quietSince,
  }: {
    showIds: string[];
    statuses: string[];
    quietSince: string;
  }) =>
    args.entries
      .filter(
        row =>
          showIds.includes(row.show_id) &&
          row.entry_status === 'confirmed' &&
          row.armband !== null &&
          row.deleted_at === null &&
          row.confirmation_email_sent_at === null &&
          (statuses as string[]).includes(row.confirmation_email_status) &&
          row.updated_at < quietSince
      )
      .sort((a, b) =>
        a.updated_at === b.updated_at
          ? a.id.localeCompare(b.id)
          : a.updated_at.localeCompare(b.updated_at)
      );
  const toJob = (row: FakeJobRow): ConfirmationJob => ({
    id: row.id,
    attemptId: row.attempt_id ?? '',
    showId: row.show_id,
    groupKey: row.group_key,
    anchorEntryId: row.entry_ids[0]!,
    entryIds: row.entry_ids,
    recipientEmail: row.recipient_email,
    subject: row.subject,
    html: row.html,
    idempotencyKey: row.idempotency_key,
    dueAt: row.due_at,
  });
  const byId = (id: string) => jobRows.find(row => row.id === id)!;

  const jobs: ConfirmationJobStore = {
    enqueue: async (job): Promise<EnqueueOutcome> => {
      const text = {
        entry_ids: job.entryIds,
        recipient_email: job.recipientEmail,
        subject: job.subject,
        html: job.html,
      };
      // One READY job per exhibitor per show, whatever its key (the partial unique index).
      const holdsSlot = (row: FakeJobRow) =>
        row.status === 'ready' && row.show_id === job.showId && row.group_key === job.groupKey;
      const existing = jobRows.find(row => row.idempotency_key === job.idempotencyKey);
      if (existing) {
        if (existing.status === 'sent') {
          return {
            outcome: 'sent',
            messageId:
              attempts.find(a => a.jobId === existing.id && a.resendMessageId)?.resendMessageId ??
              null,
          };
        }
        if (existing.status === 'ready') return { outcome: 'open' };
        if (jobRows.some(holdsSlot)) return { outcome: 'open' };
        Object.assign(existing, text, {
          status: 'ready',
          due_at: job.nowIso,
          claimed_until: null,
          attempt_id: null,
        });
        return { outcome: 'revived' };
      }
      if (jobRows.some(holdsSlot)) return { outcome: 'open' };
      jobRows.push({
        ...text,
        id: `job-${++idSeq}`,
        show_id: job.showId,
        group_key: job.groupKey,
        idempotency_key: job.idempotencyKey,
        status: 'ready',
        due_at: job.nowIso,
        claimed_until: null,
        attempt_id: null,
        email_log_id: null,
      });
      return { outcome: 'created' };
    },
    claimDue: async (limit, leaseUntilIso) => {
      const at = current.toISOString();
      return jobRows
        .filter(
          row =>
            row.status === 'ready' &&
            row.due_at <= at &&
            (row.claimed_until === null || row.claimed_until <= at)
        )
        .slice(0, limit)
        .map(row => {
          row.attempt_id = `attempt-${++idSeq}`;
          row.claimed_until = leaseUntilIso;
          return toJob(row);
        });
    },
    loadAttempts: async jobId => attempts.filter(attempt => attempt.jobId === jobId),
    recordAttempt: async (job, attempt) => {
      attempts.push({
        jobId: job.id,
        attemptedAt: current.toISOString(),
        emailLogId: null,
        resendMessageId: attempt.messageId,
        status: attempt.status,
      });
    },
    finish: async (job, outcome) => {
      const row = byId(job.id);
      // Compare-and-set on the attempt id: an abandoned attempt finishing late changes nothing.
      if (row.attempt_id !== job.attemptId) return;
      row.status = outcome.status;
      row.attempt_id = null;
      row.claimed_until = null;
      if (outcome.emailLogId) row.email_log_id = outcome.emailLogId;
    },
    releaseLease: async (job, untilIso) => {
      const row = byId(job.id);
      if (row.attempt_id !== job.attemptId) return;
      row.attempt_id = null;
      row.claimed_until = untilIso;
    },
  };

  const deps: EntryConfirmationDeps = {
    now: () => current,
    siteUrl: 'https://myk9show.com',
    loadShows: async () => args.shows,
    loadAcceptedEmailOff: async showIds =>
      new Set((args.switchedOff ?? []).filter(id => showIds.includes(id))),
    loadCandidates: async ({ showIds, statuses, quietSince }) =>
      eligibleRows({ showIds, statuses, quietSince }).slice(0, args.rowLimit ?? 500),
    loadExhibitorEntries: async ({ showIds, registrationIds, handlerIds, statuses, quietSince }) =>
      eligibleRows({ showIds, statuses, quietSince }).filter(row =>
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
    jobs,
    loadLiveEntryIds: async ids =>
      new Set(
        args.entries
          .filter(
            row =>
              ids.includes(row.id) &&
              row.entry_status === 'confirmed' &&
              row.armband !== null &&
              row.deleted_at === null &&
              row.confirmation_email_sent_at === null
          )
          .map(row => row.id)
      ),
    markSent: async (ids, messageId, nowIso) => {
      for (const row of args.entries.filter(
        item =>
          ids.includes(item.id) &&
          item.confirmation_email_sent_at === null &&
          item.entry_status === 'confirmed'
      )) {
        row.confirmation_email_sent_at = nowIso;
        row.confirmation_email_status = 'sent';
        if (messageId) row.confirmation_email_message_id = messageId;
      }
    },
    markFailed: async ids => {
      for (const row of args.entries.filter(item => ids.includes(item.id))) {
        // The entries updated_at trigger: a failed attempt moves the group to the back.
        row.updated_at = current.toISOString();
        row.confirmation_email_sent_at = null;
        row.confirmation_email_status = 'failed';
      }
    },
    findLogId: async messageId => {
      const index = logs.findIndex(row => row.resend_message_id === messageId);
      return index < 0 ? null : `log-${index + 1}`;
    },
    render: (data, renderShow) =>
      renderConfirmationEmail(data, renderShow, showRegistry(renderShow)),
    send: vi.fn(async email => {
      sends.push(email);
      const result = args.sendResult?.() ?? { ok: true as const, messageId: '' };
      if (!result.ok) return result;
      // Resend answers a repeated Idempotency-Key with the first message, never a new one.
      const first = deliveries.get(email.idempotencyKey);
      if (first) return { ok: true as const, messageId: first };
      const messageId = result.messageId || `msg-${++messageSeq}`;
      deliveries.set(email.idempotencyKey, messageId);
      return { ok: true as const, messageId };
    }),
    log: async row => {
      logs.push(row);
      return `log-${logs.length}`;
    },
  };
  return { deps, sends, deliveries, logs, advance, jobRows, attempts };
}
