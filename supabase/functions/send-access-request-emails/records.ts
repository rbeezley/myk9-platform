// Loads the request behind an access-request email job, normalized to one
// shape, and resolves who reviews it. Service-role reads; Deno-free so vitest
// can run it under node.
//
// Every access-request table references people twice (the requester and the
// reviewer), and user_roles does too (holder and granter), so every people
// embed below names its foreign key. PostgREST rejects an unhinted one with
// PGRST201 and fails the whole request (MYK9-726).

import { applyActiveRoleValidity } from '../_shared/roleValidity.ts';
import { USER_ROLE_HOLDER_EMBED } from '../_shared/userRolePerson.ts';

export type AccessRequestKind = 'new_club' | 'role' | 'membership';
export type AccessRequestEvent = 'submitted' | 'approved' | 'denied';
export type AccessRequestStatus = 'pending' | 'approved' | 'denied';
export type RequestedRole = 'secretary' | 'club_admin';

export interface Person {
  name: string;
  email: string | null;
}

export interface AccessRequestRecord {
  kind: AccessRequestKind;
  id: string;
  status: AccessRequestStatus;
  requester: Person;
  clubId: string | null;
  /** The club asked about; '' for a role request not tied to a club. */
  clubName: string;
  /** Role requests only. */
  requestedRole: RequestedRole | null;
  requesterNote: string | null;
  reviewerNote: string | null;
}

export type ReviewerAudience = { role: 'site_admin' } | { role: 'club_admin'; clubId: string };

interface QueryResult<T = unknown> {
  data: T | null;
  error: unknown;
}

export interface Query extends PromiseLike<QueryResult> {
  select(columns: string): Query;
  eq(column: string, value: unknown): Query;
  or(filters: string): Query;
  not(column: string, operator: string, value: unknown): Query;
  maybeSingle(): Promise<QueryResult>;
}

export interface RecordsClient {
  from(table: string): Query;
}

/** A read failed; the job should be retried, not skipped. */
export class RecordLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecordLoadError';
  }
}

type PersonRow = { first_name: string | null; last_name: string | null; email: string | null };
type Embedded<T> = T | T[] | null | undefined;

function one<T>(value: Embedded<T>): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export function personFromRow(row: PersonRow | null): Person {
  const name = [row?.first_name, row?.last_name].filter(Boolean).join(' ').trim();
  return { name: name || 'there', email: row?.email?.trim() || null };
}

function asStatus(value: unknown): AccessRequestStatus {
  if (value === 'pending' || value === 'approved' || value === 'denied') {
    return value;
  }
  throw new RecordLoadError('access request has an unexpected status');
}

async function single<T>(query: Query): Promise<T | null> {
  const { data, error } = await query.maybeSingle();
  if (error) throw new RecordLoadError('failed to load the access request');
  return data as T | null;
}

const PERSON_COLUMNS = '(first_name,last_name,email)';

/** The request behind a job, or null when it no longer exists. */
export async function loadAccessRequest(
  client: RecordsClient,
  kind: AccessRequestKind,
  requestId: string
): Promise<AccessRequestRecord | null> {
  if (kind === 'new_club') {
    const row = await single<{
      id: string;
      status: string;
      requested_club_name: string;
      approved_club_id: string | null;
      request_note: string | null;
      review_note: string | null;
      requester: Embedded<PersonRow>;
      approved_club: Embedded<{ name: string | null }>;
    }>(
      client
        .from('club_access_requests')
        .select(
          `id, status, requested_club_name, approved_club_id, request_note, review_note, requester:people!club_access_requests_requester_person_id_fkey${PERSON_COLUMNS}, approved_club:clubs!club_access_requests_approved_club_id_fkey(name)`
        )
        .eq('id', requestId)
    );
    if (!row) return null;
    return {
      kind,
      id: row.id,
      status: asStatus(row.status),
      requester: personFromRow(one(row.requester)),
      clubId: row.approved_club_id,
      clubName: one(row.approved_club)?.name?.trim() || row.requested_club_name,
      requestedRole: null,
      requesterNote: row.request_note,
      reviewerNote: row.review_note,
    };
  }

  const table = kind === 'role' ? 'role_requests' : 'club_membership_requests';
  const roleColumns = kind === 'role' ? ', requested_role' : '';
  const row = await single<{
    id: string;
    status: string;
    club_id: string | null;
    requester_note: string | null;
    reviewer_note: string | null;
    requested_role?: string;
    person: Embedded<PersonRow>;
    club: Embedded<{ name: string | null }>;
  }>(
    client
      .from(table)
      .select(
        `id, status, club_id, requester_note, reviewer_note${roleColumns}, person:people!${table}_person_id_fkey${PERSON_COLUMNS}, club:clubs(name)`
      )
      .eq('id', requestId)
  );
  if (!row) return null;
  return {
    kind,
    id: row.id,
    status: asStatus(row.status),
    requester: personFromRow(one(row.person)),
    clubId: row.club_id,
    clubName: one(row.club)?.name?.trim() || (row.club_id ? 'your club' : ''),
    requestedRole:
      row.requested_role === 'secretary' || row.requested_role === 'club_admin'
        ? row.requested_role
        : null,
    requesterNote: row.requester_note,
    reviewerNote: row.reviewer_note,
  };
}

/**
 * Who reviews the request, matching the RPC that can decide it: a club's
 * admins decide membership asks and club-routed secretary asks
 * (approve_club_role_request); site admins decide new clubs and every other
 * role request, including the ones signup creates with no club.
 */
export function reviewerAudience(record: AccessRequestRecord): ReviewerAudience {
  if (record.kind === 'membership' && record.clubId) {
    return { role: 'club_admin', clubId: record.clubId };
  }
  if (record.kind === 'role' && record.requestedRole === 'secretary' && record.clubId) {
    return { role: 'club_admin', clubId: record.clubId };
  }
  return { role: 'site_admin' };
}

/** Holders of a currently valid reviewer role, de-duplicated by address. */
export async function reviewerRecipients(
  client: RecordsClient,
  audience: ReviewerAudience
): Promise<Person[]> {
  let query = client
    .from('user_roles')
    .select(`${USER_ROLE_HOLDER_EMBED}!inner${PERSON_COLUMNS}, roles!inner(name)`)
    .eq('roles.name', audience.role);
  if (audience.role === 'club_admin') query = query.eq('club_id', audience.clubId);

  const { data, error } = await applyActiveRoleValidity(query);
  if (error) throw new RecordLoadError('failed to resolve reviewer recipients');

  const seen = new Set<string>();
  const people: Person[] = [];
  for (const row of (data ?? []) as Array<{ people: Embedded<PersonRow> }>) {
    const person = personFromRow(one(row.people));
    const key = person.email?.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    people.push(person);
  }
  return people;
}
