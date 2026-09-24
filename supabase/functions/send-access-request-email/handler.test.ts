// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createSendAccessRequestEmailHandler, type AccessRequestEmailClient } from './handler.ts';

type Row = Record<string, unknown>;

interface Store {
  requests: Record<string, Row | null>;
  people: Record<string, Row>;
  userRoles: Row[];
  emailLog: Row[];
  claimError?: { code: string } | null;
}

const REQUEST_ID = '11111111-1111-4111-8111-111111111111';
const REQUESTER_AUTH = 'auth-requester';
const REVIEWER_AUTH = 'auth-reviewer';

/** A tiny PostgREST-shaped fake: enough of the chain for this handler. */
function fakeClient(store: Store): AccessRequestEmailClient {
  return {
    from(table: string) {
      const filters: Array<[string, unknown]> = [];
      let op: 'select' | 'insert' | 'update' = 'select';
      let payload: Row = {};
      const builder = {
        select() {
          return builder;
        },
        eq(column: string, value: unknown) {
          filters.push([column, value]);
          return builder;
        },
        or() {
          return builder;
        },
        not() {
          return builder;
        },
        insert(values: Row) {
          op = 'insert';
          payload = values;
          return builder;
        },
        update(values: Row) {
          op = 'update';
          payload = values;
          return builder;
        },
        async maybeSingle() {
          const id = filters.find(([column]) => column === 'id')?.[1] as string;
          if (table === 'people') return { data: store.people[id] ?? null, error: null };
          return { data: store.requests[table] ?? null, error: null };
        },
        async single() {
          if (op === 'insert') {
            if (store.claimError) return { data: null, error: store.claimError };
            const duplicate = store.emailLog.some(
              row =>
                row.email_type === payload.email_type &&
                row.related_id === payload.related_id &&
                String(row.recipient_email).toLowerCase() ===
                  String(payload.recipient_email).toLowerCase()
            );
            if (duplicate) return { data: null, error: { code: '23505' } };
            const row = { id: `log-${store.emailLog.length + 1}`, ...payload };
            store.emailLog.push(row);
            return { data: { id: row.id }, error: null };
          }
          return { data: null, error: null };
        },
        then(resolve: (value: unknown) => void) {
          if (op === 'update') {
            const id = filters.find(([column]) => column === 'id')?.[1];
            const row = store.emailLog.find(entry => entry.id === id);
            if (row) Object.assign(row, payload);
            resolve({ data: null, error: null });
            return;
          }
          // user_roles recipient lookup
          const roleName = filters.find(([column]) => column === 'roles.name')?.[1];
          const clubId = filters.find(([column]) => column === 'club_id')?.[1];
          const data = store.userRoles.filter(
            row => row.role === roleName && (clubId === undefined || row.club_id === clubId)
          );
          resolve({ data, error: null });
        },
      };
      return builder as never;
    },
  };
}

function person(first: string, email: string | null) {
  return { first_name: first, last_name: 'Tester', email };
}

function okFetch() {
  return vi.fn(async () => new Response(JSON.stringify({ id: 'resend-1' }), { status: 200 }));
}

function sentTo(fetchImpl: ReturnType<typeof okFetch>) {
  return fetchImpl.mock.calls.map(call => {
    const init = (call as unknown as [string, RequestInit])[1];
    return JSON.parse(String(init.body)) as { to: string; subject: string; html: string };
  });
}

let store: Store;

beforeEach(() => {
  store = {
    requests: {},
    people: { 'person-reviewer': { auth_user_id: REVIEWER_AUTH } },
    userRoles: [
      { role: 'site_admin', club_id: null, people: person('Sally', 'site-admin@example.test') },
      { role: 'club_admin', club_id: 'club-1', people: person('Carl', 'club1-admin@example.test') },
      { role: 'club_admin', club_id: 'club-2', people: person('Olga', 'club2-admin@example.test') },
    ],
    emailLog: [],
  };
});

function run(fetchImpl: typeof fetch, body: Row, userId: string) {
  const handler = createSendAccessRequestEmailHandler({
    resendApiKey: 're_test',
    siteUrl: 'https://myk9show.test',
    fetchImpl,
  });
  return handler({ body, user: { id: userId }, supabase: fakeClient(store) });
}

function newClubRequest(overrides: Row = {}): Row {
  return {
    id: REQUEST_ID,
    status: 'pending',
    requester_auth_user_id: REQUESTER_AUTH,
    requested_club_name: 'Heartland Dog Club',
    approved_club_id: null,
    request_note: null,
    review_note: null,
    reviewed_by: null,
    requester: person('Rita', 'rita@example.test'),
    approved_club: null,
    ...overrides,
  };
}

function clubRoutedRequest(overrides: Row = {}): Row {
  return {
    id: REQUEST_ID,
    status: 'pending',
    auth_user_id: REQUESTER_AUTH,
    club_id: 'club-1',
    requester_note: 'I run entries for this club.',
    reviewer_note: null,
    reviewed_by: null,
    requested_role: 'secretary',
    requested_scope: 'club',
    person: person('Rita', 'rita@example.test'),
    club: { name: 'Heartland Dog Club' },
    ...overrides,
  };
}

describe('send-access-request-email', () => {
  it('confirms a new-club request to the requester and notifies every site admin', async () => {
    store.requests.club_access_requests = newClubRequest();
    const fetchImpl = okFetch();

    const result = await run(
      fetchImpl,
      { kind: 'new_club', requestId: REQUEST_ID, event: 'submitted' },
      REQUESTER_AUTH
    );

    expect(result).toMatchObject({ event: 'submitted', sent: 2, failed: 0 });
    const emails = sentTo(fetchImpl);
    expect(emails.map(email => email.to)).toEqual(['rita@example.test', 'site-admin@example.test']);
    expect(emails[0].html).toContain('waiting for review');
    expect(emails[0].html).toContain('Heartland Dog Club');
    expect(emails[1].html).toContain('Rita Tester');
    expect(emails[1].html).toContain('rita@example.test');
    expect(store.emailLog.map(row => [row.email_type, row.status])).toEqual([
      ['access_request_new_club_received', 'sent'],
      ['access_request_new_club_submitted', 'sent'],
    ]);
  });

  it('refuses a submitted event from anyone but the requester and sends nothing', async () => {
    store.requests.club_access_requests = newClubRequest();
    const fetchImpl = okFetch();

    await expect(
      run(fetchImpl, { kind: 'new_club', requestId: REQUEST_ID, event: 'submitted' }, 'auth-someone-else')
    ).rejects.toMatchObject({ status: 403 });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(store.emailLog).toEqual([]);
  });

  it("notifies only the requested club's admins of a secretary request, with the reason", async () => {
    store.requests.role_requests = clubRoutedRequest();
    const fetchImpl = okFetch();

    await run(fetchImpl, { kind: 'secretary', requestId: REQUEST_ID, event: 'submitted' }, REQUESTER_AUTH);

    const emails = sentTo(fetchImpl);
    expect(emails.map(email => email.to)).toEqual(['club1-admin@example.test']);
    expect(emails[0].html).toContain('I run entries for this club.');
    expect(emails[0].html).toContain('Heartland Dog Club');
    expect(emails[0].html).toContain('rita@example.test');
    expect(store.emailLog[0].email_type).toBe('access_request_secretary_submitted');
  });

  it("notifies the club's admins of a membership request", async () => {
    store.requests.club_membership_requests = clubRoutedRequest({
      requested_role: undefined,
      requested_scope: undefined,
      club_id: 'club-2',
    });
    const fetchImpl = okFetch();

    await run(fetchImpl, { kind: 'membership', requestId: REQUEST_ID, event: 'submitted' }, REQUESTER_AUTH);

    expect(sentTo(fetchImpl).map(email => email.to)).toEqual(['club2-admin@example.test']);
    expect(store.emailLog[0].email_type).toBe('access_request_membership_submitted');
  });

  it('does not treat a signup (club-less) role request as a club notification', async () => {
    store.requests.role_requests = clubRoutedRequest({ club_id: null });

    await expect(
      run(okFetch(), { kind: 'secretary', requestId: REQUEST_ID, event: 'submitted' }, REQUESTER_AUTH)
    ).rejects.toMatchObject({ status: 404 });
  });

  it('emails the requester an approval naming the club, only when the reviewer triggers it', async () => {
    store.requests.role_requests = clubRoutedRequest({
      status: 'approved',
      reviewed_by: 'person-reviewer',
    });
    const fetchImpl = okFetch();

    await expect(
      run(fetchImpl, { kind: 'secretary', requestId: REQUEST_ID, event: 'decision' }, REQUESTER_AUTH)
    ).rejects.toMatchObject({ status: 403 });
    expect(fetchImpl).not.toHaveBeenCalled();

    const result = await run(
      fetchImpl,
      { kind: 'secretary', requestId: REQUEST_ID, event: 'decision' },
      REVIEWER_AUTH
    );

    expect(result).toMatchObject({ event: 'approved', sent: 1 });
    const [email] = sentTo(fetchImpl);
    expect(email.to).toBe('rita@example.test');
    expect(email.subject).toBe('Show access approved at Heartland Dog Club');
    expect(email.html).toContain('show-manager access is now available');
  });

  it('tells an approved new-club requester that club-admin access is available', async () => {
    store.requests.club_access_requests = newClubRequest({
      status: 'approved',
      reviewed_by: 'person-reviewer',
      approved_club: { name: 'Heartland Dog Club of Omaha' },
    });
    const fetchImpl = okFetch();

    await run(fetchImpl, { kind: 'new_club', requestId: REQUEST_ID, event: 'decision' }, REVIEWER_AUTH);

    const [email] = sentTo(fetchImpl);
    expect(email.subject).toBe('Your club is ready: Heartland Dog Club of Omaha');
    expect(email.html).toContain('Club-admin access is now available');
    expect(store.emailLog[0].email_type).toBe('access_request_new_club_approved');
  });

  it('includes the review note in a denial, and a generic explanation without one', async () => {
    store.requests.club_membership_requests = clubRoutedRequest({
      status: 'denied',
      reviewed_by: 'person-reviewer',
      reviewer_note: 'Membership is limited to county residents.',
    });
    const withNote = okFetch();
    await run(withNote, { kind: 'membership', requestId: REQUEST_ID, event: 'decision' }, REVIEWER_AUTH);
    expect(sentTo(withNote)[0].html).toContain('Membership is limited to county residents.');

    store.emailLog = [];
    store.requests.club_access_requests = newClubRequest({
      status: 'denied',
      reviewed_by: 'person-reviewer',
    });
    const withoutNote = okFetch();
    await run(withoutNote, { kind: 'new_club', requestId: REQUEST_ID, event: 'decision' }, REVIEWER_AUTH);
    const [email] = sentTo(withoutNote);
    expect(email.to).toBe('rita@example.test');
    expect(email.html).toContain('could not approve it as submitted');
    expect(store.emailLog[0].email_type).toBe('access_request_new_club_denied');
  });

  it('sends nothing twice: a repeated call finds its claims and skips', async () => {
    store.requests.club_access_requests = newClubRequest();
    const fetchImpl = okFetch();

    await run(fetchImpl, { kind: 'new_club', requestId: REQUEST_ID, event: 'submitted' }, REQUESTER_AUTH);
    const second = await run(
      fetchImpl,
      { kind: 'new_club', requestId: REQUEST_ID, event: 'submitted' },
      REQUESTER_AUTH
    );

    expect(second).toMatchObject({ sent: 0, skipped: 2 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(store.emailLog).toHaveLength(2);
  });

  it('records a provider failure on the claim and still resolves', async () => {
    store.requests.club_membership_requests = clubRoutedRequest({
      status: 'approved',
      reviewed_by: 'person-reviewer',
    });
    const failing = vi.fn(async () => new Response('bad', { status: 422 }));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await run(
      failing as unknown as typeof fetch,
      { kind: 'membership', requestId: REQUEST_ID, event: 'decision' },
      REVIEWER_AUTH
    );

    expect(result).toMatchObject({ sent: 0, failed: 1 });
    expect(store.emailLog[0]).toMatchObject({
      email_type: 'access_request_membership_approved',
      status: 'failed',
      error_message: 'provider_http_422',
    });
  });

  it('does not send when the claim itself cannot be written', async () => {
    store.requests.club_access_requests = newClubRequest();
    store.claimError = { code: '42501' };
    const fetchImpl = okFetch();
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await run(
      fetchImpl,
      { kind: 'new_club', requestId: REQUEST_ID, event: 'submitted' },
      REQUESTER_AUTH
    );

    expect(result).toMatchObject({ sent: 0, failed: 2 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects an unknown kind or a malformed id before reading anything', async () => {
    await expect(
      run(okFetch(), { kind: 'club_admin', requestId: REQUEST_ID, event: 'submitted' }, REQUESTER_AUTH)
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      run(okFetch(), { kind: 'new_club', requestId: 'not-a-uuid', event: 'submitted' }, REQUESTER_AUTH)
    ).rejects.toMatchObject({ status: 400 });
  });

  it('still sends submission emails when the request was reviewed before the call landed', async () => {
    store.requests.role_requests = clubRoutedRequest({
      status: 'approved',
      reviewed_by: 'person-reviewer',
    });
    const fetchImpl = okFetch();

    const result = await run(
      fetchImpl,
      { kind: 'secretary', requestId: REQUEST_ID, event: 'submitted' },
      REQUESTER_AUTH
    );

    expect(result).toMatchObject({ event: 'submitted', sent: 1 });
    expect(sentTo(fetchImpl).map(email => email.to)).toEqual(['club1-admin@example.test']);
    expect(store.emailLog[0].email_type).toBe('access_request_secretary_submitted');
  });

  it('refuses a decision event for a request that is still pending', async () => {
    store.requests.club_membership_requests = clubRoutedRequest({ reviewed_by: 'person-reviewer' });

    await expect(
      run(okFetch(), { kind: 'membership', requestId: REQUEST_ID, event: 'decision' }, REVIEWER_AUTH)
    ).rejects.toMatchObject({ status: 409 });
  });

  it('rejects a missing event', async () => {
    store.requests.club_access_requests = newClubRequest();
    await expect(
      run(okFetch(), { kind: 'new_club', requestId: REQUEST_ID }, REQUESTER_AUTH)
    ).rejects.toMatchObject({ status: 400 });
  });
});
