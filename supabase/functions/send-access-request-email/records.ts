// Loads an access request (new club, club secretary, or club membership) with
// the service-role client and normalizes it to one shape, plus the recipient
// lookups the notification needs. Deno-free so vitest can run it under node.

import { HttpError } from '../_shared/http/responses.ts';
import { applyActiveRoleValidity } from '../_shared/roleValidity.ts';

export type AccessRequestKind = 'new_club' | 'secretary' | 'membership';
export type AccessRequestStatus = 'pending' | 'approved' | 'denied';

export interface Person {
  name: string;
  email: string | null;
}

export interface AccessRequestRecord {
  kind: AccessRequestKind;
  id: string;
  status: AccessRequestStatus;
  requesterAuthUserId: string;
  requester: Person;
  clubId: string | null;
  clubName: string;
  requesterNote: string | null;
  reviewerNote: string | null;
  reviewedByPersonId: string | null;
}

interface QueryResult<T = unknown> {
  data: T | null;
  error: unknown;
}

interface Query<T = unknown> extends PromiseLike<QueryResult<T>> {
  select(columns: string): Query<T>;
  eq(column: string, value: unknown): Query<T>;
  or(filters: string): Query<T>;
  not(column: string, operator: string, value: unknown): Query<T>;
  maybeSingle(): Promise<QueryResult<T>>;
}

export interface RecordsClient {
  from(table: string): Query;
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
  if (value === 'pending' || value === 'approved' || value === 'denied') return value;
  throw new HttpError(500, 'Access request has an unexpected status');
}

async function single<T>(query: Query): Promise<T | null> {
  const { data, error } = (await query.maybeSingle()) as QueryResult<T>;
  if (error) throw new HttpError(500, 'Failed to load the access request');
  return data;
}

export async function loadAccessRequest(
  client: RecordsClient,
  kind: AccessRequestKind,
  requestId: string
): Promise<AccessRequestRecord> {
  if (kind === 'new_club') {
    const row = await single<{
      id: string;
      status: string;
      requester_auth_user_id: string;
      requested_club_name: string;
      approved_club_id: string | null;
      request_note: string | null;
      review_note: string | null;
      reviewed_by: string | null;
      requester: Embedded<PersonRow>;
      approved_club: Embedded<{ name: string | null }>;
    }>(
      client
        .from('club_access_requests')
        .select(
          'id, status, requester_auth_user_id, requested_club_name, approved_club_id, request_note, review_note, reviewed_by, requester:people!club_access_requests_requester_person_id_fkey(first_name,last_name,email), approved_club:clubs!club_access_requests_approved_club_id_fkey(name)'
        )
        .eq('id', requestId)
    );
    if (!row) throw new HttpError(404, 'Access request not found');
    return {
      kind,
      id: row.id,
      status: asStatus(row.status),
      requesterAuthUserId: row.requester_auth_user_id,
      requester: personFromRow(one(row.requester)),
      clubId: row.approved_club_id,
      clubName: one(row.approved_club)?.name?.trim() || row.requested_club_name,
      requesterNote: row.request_note,
      reviewerNote: row.review_note,
      reviewedByPersonId: row.reviewed_by,
    };
  }

  const table = kind === 'secretary' ? 'role_requests' : 'club_membership_requests';
  const personFk =
    kind === 'secretary'
      ? 'role_requests_person_id_fkey'
      : 'club_membership_requests_person_id_fkey';
  const shapeColumns = kind === 'secretary' ? ', requested_role, requested_scope' : '';

  const row = await single<{
    id: string;
    status: string;
    auth_user_id: string;
    club_id: string | null;
    requester_note: string | null;
    reviewer_note: string | null;
    reviewed_by: string | null;
    requested_role?: string;
    requested_scope?: string;
    person: Embedded<PersonRow>;
    club: Embedded<{ name: string | null }>;
  }>(
    client
      .from(table)
      .select(
        `id, status, auth_user_id, club_id, requester_note, reviewer_note, reviewed_by${shapeColumns}, person:people!${personFk}(first_name,last_name,email), club:clubs(name)`
      )
      .eq('id', requestId)
  );
  if (!row) throw new HttpError(404, 'Access request not found');
  // Only club-routed secretary asks are club-admin notifications; a signup
  // role request (club_id NULL) or a club_admin ask belongs to the site-admin
  // inbox, which this function does not serve.
  if (
    kind === 'secretary' &&
    (row.requested_role !== 'secretary' || row.requested_scope !== 'club' || !row.club_id)
  ) {
    throw new HttpError(404, 'Access request not found');
  }
  return {
    kind,
    id: row.id,
    status: asStatus(row.status),
    requesterAuthUserId: row.auth_user_id,
    requester: personFromRow(one(row.person)),
    clubId: row.club_id,
    clubName: one(row.club)?.name?.trim() || 'the club',
    requesterNote: row.requester_note,
    reviewerNote: row.reviewer_note,
    reviewedByPersonId: row.reviewed_by,
  };
}

/** The auth user behind a people row (the reviewer), or null. */
export async function authUserIdForPerson(
  client: RecordsClient,
  personId: string
): Promise<string | null> {
  const row = await single<{ auth_user_id: string | null }>(
    client.from('people').select('auth_user_id').eq('id', personId)
  );
  return row?.auth_user_id ?? null;
}

/** Holders of a currently valid role, optionally scoped to one club. */
export async function roleHolderRecipients(
  client: RecordsClient,
  roleName: 'site_admin' | 'club_admin',
  clubId?: string
): Promise<Person[]> {
  let query = client
    .from('user_roles')
    .select('is_active, expires_at, people!inner(first_name,last_name,email), roles!inner(name)')
    .eq('roles.name', roleName);
  if (clubId) query = query.eq('club_id', clubId);

  const { data, error } = (await applyActiveRoleValidity(query)) as QueryResult<
    Array<{ people: Embedded<PersonRow> }>
  >;
  if (error) throw new HttpError(500, 'Failed to resolve notification recipients');

  const seen = new Set<string>();
  const people: Person[] = [];
  for (const row of data ?? []) {
    const person = personFromRow(one(row.people));
    const key = person.email?.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    people.push(person);
  }
  return people;
}
