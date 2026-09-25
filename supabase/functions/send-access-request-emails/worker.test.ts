// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { findAmbiguousEmbed } from '../_shared/testing/postgrestFake.ts';
import { idempotencyKey } from './plan.ts';
import { runAccessRequestEmailQueue, type QueueClient, type QueueJob } from './worker.ts';

type Row = Record<string, unknown>;

const REQUEST_ID = '11111111-1111-4111-8111-111111111111';

interface Store {
  jobs: QueueJob[];
  tables: Record<string, Row[]>;
  emailLog: Row[];
  finishes: Array<{
    jobId: string;
    token: string;
    outcome: string;
    delivered: string[];
    error: string | null;
  }>;
  finishResult: string | null;
  failTable?: string;
}

/**
 * PostgREST-shaped fake: `eq` filters on plain and one-level embedded
 * columns, `or` is the role-validity filter, and an embed of a table reached
 * through two foreign keys without an FK hint fails the way PostgREST does.
 */
function fakeClient(store: Store): QueueClient {
  return {
    async rpc(fn: string, args: Row) {
      if (fn === 'claim_access_request_email_jobs') {
        const claimed = store.jobs.map(job => ({ ...job, claim_token: `token-${job.id}` }));
        store.jobs = [];
        return { data: claimed, error: null };
      }
      if (fn === 'finish_access_request_email_job') {
        store.finishes.push({
          jobId: String(args.p_job_id),
          token: String(args.p_claim_token),
          outcome: String(args.p_outcome),
          delivered: (args.p_delivered_to as string[]) ?? [],
          error: (args.p_error as string | null) ?? null,
        });
        const echoed = args.p_outcome === 'retry' ? 'pending' : String(args.p_outcome);
        return { data: store.finishResult === 'echo' ? echoed : store.finishResult, error: null };
      }
      return { data: null, error: { code: '42883', message: `no function ${fn}` } };
    },
    from(table: string) {
      const filters: Array<[string, unknown]> = [];
      let columns = '*';
      let validity = false;
      const resolve = () => {
        if (store.failTable === table) {
          return { data: null, error: { code: '57014', message: 'timeout' } };
        }
        const ambiguous = findAmbiguousEmbed(table, columns);
        if (ambiguous) return { data: null, error: { code: 'PGRST201', message: ambiguous } };
        let rows = store.tables[table] ?? [];
        for (const [column, value] of filters) {
          rows = rows.filter(row => {
            const [head, tail] = column.split('.');
            const cell = tail ? (row[head] as Row | undefined)?.[tail] : row[head];
            return cell === value;
          });
        }
        if (validity) {
          rows = rows.filter(
            row =>
              row.is_active === true &&
              (row.expires_at == null || Date.parse(String(row.expires_at)) > Date.now())
          );
        }
        return { data: rows, error: null };
      };
      const builder = {
        select(selected: string) {
          columns = selected;
          return builder;
        },
        eq(column: string, value: unknown) {
          if (column !== 'is_active') filters.push([column, value]);
          return builder;
        },
        or() {
          validity = true;
          return builder;
        },
        not() {
          return builder;
        },
        async maybeSingle() {
          const { data, error } = resolve();
          return { data: data?.[0] ?? null, error };
        },
        insert(values: Row) {
          if (table === 'email_log') store.emailLog.push(values);
          return Promise.resolve({ data: null, error: null });
        },
        then(onFulfilled: (value: unknown) => unknown) {
          return Promise.resolve(resolve()).then(onFulfilled);
        },
      };
      return builder as never;
    },
  };
}

function person(first: string, email: string | null) {
  return { first_name: first, last_name: 'Tester', email };
}

function job(overrides: Partial<QueueJob> = {}): QueueJob {
  return {
    id: 'job-1',
    request_kind: 'membership',
    request_id: REQUEST_ID,
    event: 'submitted',
    attempts: 1,
    delivered_to: [],
    claim_token: null,
    ...overrides,
  };
}

function membershipRow(overrides: Row = {}): Row {
  return {
    id: REQUEST_ID,
    status: 'pending',
    club_id: 'club-1',
    requester_note: 'Long-time exhibitor.',
    reviewer_note: null,
    person: person('Rita', 'rita@example.test'),
    club: { name: 'Heartland Dog Club' },
    ...overrides,
  };
}

function okFetch() {
  return vi.fn(
    async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(JSON.stringify({ id: 'resend-1' }), { status: 200 })
  );
}

function sent(fetchImpl: ReturnType<typeof okFetch>) {
  return fetchImpl.mock.calls.map(([, init]) => ({
    body: JSON.parse(String(init?.body)) as { to: string; subject: string; html: string },
    key: new Headers(init?.headers).get('Idempotency-Key'),
  }));
}

let store: Store;

beforeEach(() => {
  store = {
    jobs: [],
    tables: {
      user_roles: [
        {
          is_active: true,
          expires_at: null,
          roles: { name: 'site_admin' },
          club_id: null,
          people: person('Sally', 'site-admin@example.test'),
        },
        {
          is_active: true,
          expires_at: null,
          roles: { name: 'club_admin' },
          club_id: 'club-1',
          people: person('Carl', 'club1-admin@example.test'),
        },
        {
          is_active: false,
          expires_at: null,
          roles: { name: 'club_admin' },
          club_id: 'club-1',
          people: person('Ina', 'inactive@example.test'),
        },
        {
          is_active: true,
          expires_at: '2000-01-01T00:00:00Z',
          roles: { name: 'club_admin' },
          club_id: 'club-1',
          people: person('Eve', 'expired@example.test'),
        },
        {
          is_active: true,
          expires_at: null,
          roles: { name: 'club_admin' },
          club_id: 'club-2',
          people: person('Olga', 'club2-admin@example.test'),
        },
      ],
    },
    emailLog: [],
    finishes: [],
    finishResult: 'echo',
  };
});

function run(
  fetchImpl: typeof fetch,
  overrides: Partial<Parameters<typeof runAccessRequestEmailQueue>[1]> = {}
) {
  return runAccessRequestEmailQueue(fakeClient(store), {
    resendApiKey: 're_test',
    siteUrl: 'https://myk9show.test',
    fetchImpl,
    retry: { sleep: async () => undefined, random: () => 0 },
    ...overrides,
  });
}

describe('send-access-request-emails worker', () => {
  it('emails the requester and the active admins of that club, then marks the job sent', async () => {
    store.jobs = [job()];
    store.tables.club_membership_requests = [membershipRow()];
    const fetchImpl = okFetch();

    const summary = await run(fetchImpl);

    expect(sent(fetchImpl).map(email => email.body.to)).toEqual([
      'rita@example.test',
      'club1-admin@example.test',
    ]);
    expect(store.finishes).toEqual([
      {
        jobId: 'job-1',
        token: 'token-job-1',
        outcome: 'sent',
        delivered: ['rita@example.test', 'club1-admin@example.test'],
        error: null,
      },
    ]);
    expect(store.emailLog.map(row => [row.email_type, row.status, row.related_id])).toEqual([
      ['access_request_membership_received', 'sent', REQUEST_ID],
      ['access_request_membership_submitted', 'sent', REQUEST_ID],
    ]);
    expect(summary).toMatchObject({ claimed: 1, sent: 1, retried: 0, skipped: 0 });
  });

  it('keys each provider call on the job and recipient, so a replay is de-duplicated', async () => {
    store.jobs = [job()];
    store.tables.club_membership_requests = [membershipRow()];
    const fetchImpl = okFetch();

    await run(fetchImpl);

    expect(sent(fetchImpl).map(email => email.key)).toEqual([
      idempotencyKey('job-1', 'rita@example.test'),
      idempotencyKey('job-1', 'club1-admin@example.test'),
    ]);
  });

  it('notifies site admins of a new-club request, with the requester details', async () => {
    store.jobs = [job({ request_kind: 'new_club' })];
    store.tables.club_access_requests = [
      {
        id: REQUEST_ID,
        status: 'pending',
        requested_club_name: 'Founders Club',
        approved_club_id: null,
        request_note: null,
        review_note: null,
        requester: person('Rita', 'rita@example.test'),
        approved_club: null,
      },
    ];
    const fetchImpl = okFetch();

    await run(fetchImpl);

    const emails = sent(fetchImpl);
    expect(emails.map(email => email.body.to)).toEqual([
      'rita@example.test',
      'site-admin@example.test',
    ]);
    expect(emails[1].body.html).toContain('Rita Tester');
    expect(emails[1].body.html).toContain('rita@example.test');
    expect(emails[1].body.html).toContain('Founders Club');
  });

  it('routes a signup role request with no club to site admins', async () => {
    store.jobs = [job({ request_kind: 'role' })];
    store.tables.role_requests = [
      {
        id: REQUEST_ID,
        status: 'pending',
        club_id: null,
        requested_role: 'secretary',
        requested_scope: 'club',
        requester_note: 'Created from OAuth signup role intent.',
        reviewer_note: null,
        person: person('Sam', 'sam@example.test'),
        club: null,
      },
    ];
    const fetchImpl = okFetch();

    await run(fetchImpl);

    expect(sent(fetchImpl).map(email => email.body.to)).toEqual([
      'sam@example.test',
      'site-admin@example.test',
    ]);
  });

  it('sends a decision only to the requester, with the reviewer note', async () => {
    store.jobs = [job({ request_kind: 'role', event: 'denied' })];
    store.tables.role_requests = [
      {
        id: REQUEST_ID,
        status: 'denied',
        club_id: 'club-1',
        requested_role: 'secretary',
        requested_scope: 'club',
        requester_note: 'I run entries.',
        reviewer_note: 'We already have a secretary.',
        person: person('Rita', 'rita@example.test'),
        club: { name: 'Heartland Dog Club' },
      },
    ];
    const fetchImpl = okFetch();

    await run(fetchImpl);

    const emails = sent(fetchImpl);
    expect(emails.map(email => email.body.to)).toEqual(['rita@example.test']);
    expect(emails[0].body.html).toContain('We already have a secretary.');
    expect(store.finishes[0].outcome).toBe('sent');
  });

  it('asks for a retry when a send fails, keeping the recipients it reached', async () => {
    store.jobs = [job()];
    store.tables.club_membership_requests = [membershipRow()];
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const to = JSON.parse(String(init?.body)).to;
      return to === 'club1-admin@example.test'
        ? new Response('boom', { status: 500 })
        : new Response(JSON.stringify({ id: 'resend-1' }), { status: 200 });
    });

    const summary = await run(fetchImpl);

    expect(store.finishes).toEqual([
      expect.objectContaining({
        outcome: 'retry',
        delivered: ['rita@example.test'],
        error: 'provider_http_500',
      }),
    ]);
    expect(store.emailLog.map(row => [row.recipient_email, row.status, row.error_message])).toEqual(
      [
        ['rita@example.test', 'sent', null],
        ['club1-admin@example.test', 'failed', 'provider_http_500'],
      ]
    );
    expect(summary).toMatchObject({ retried: 1, sent: 0 });
  });

  it('treats a thrown network error as retryable', async () => {
    store.jobs = [job({ event: 'approved' })];
    store.tables.club_membership_requests = [membershipRow({ status: 'approved' })];
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('network down');
    });

    await run(fetchImpl as unknown as typeof fetch);

    expect(store.finishes[0]).toMatchObject({
      outcome: 'retry',
      delivered: [],
      error: 'email_delivery_error',
    });
  });

  it('does not re-send to recipients a previous attempt already reached', async () => {
    store.jobs = [job({ attempts: 2, delivered_to: ['rita@example.test'] })];
    store.tables.club_membership_requests = [membershipRow()];
    const fetchImpl = okFetch();

    await run(fetchImpl);

    expect(sent(fetchImpl).map(email => email.body.to)).toEqual(['club1-admin@example.test']);
    expect(store.finishes[0]).toMatchObject({
      outcome: 'sent',
      delivered: ['club1-admin@example.test'],
    });
  });

  it('skips a job whose request no longer exists', async () => {
    store.jobs = [job()];
    store.tables.club_membership_requests = [];
    const fetchImpl = okFetch();

    const summary = await run(fetchImpl);

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(store.finishes[0]).toMatchObject({ outcome: 'skipped' });
    expect(summary).toMatchObject({ skipped: 1 });
  });

  it('skips a job with nobody to email', async () => {
    store.jobs = [job({ event: 'approved' })];
    store.tables.club_membership_requests = [
      membershipRow({ status: 'approved', person: person('Rita', null) }),
    ];
    const fetchImpl = okFetch();

    await run(fetchImpl);

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(store.finishes[0]).toMatchObject({ outcome: 'skipped' });
  });

  it('retries, without sending, when the request cannot be read', async () => {
    store.jobs = [job()];
    store.failTable = 'club_membership_requests';
    const fetchImpl = okFetch();

    await run(fetchImpl);

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(store.finishes[0]).toMatchObject({ outcome: 'retry', error: 'request_load_failed' });
  });

  it('refuses to claim anything when the email service is not configured', async () => {
    store.jobs = [job()];
    const fetchImpl = okFetch();

    await expect(run(fetchImpl, { resendApiKey: null })).rejects.toMatchObject({ status: 503 });
    expect(store.jobs).toHaveLength(1);
    expect(store.finishes).toEqual([]);
  });

  it('counts a finish whose claim was lost instead of throwing', async () => {
    store.jobs = [job()];
    store.tables.club_membership_requests = [membershipRow()];
    store.finishResult = null;

    const summary = await run(okFetch());

    expect(summary).toMatchObject({ claimed: 1, lost: 1, sent: 0 });
  });
});
