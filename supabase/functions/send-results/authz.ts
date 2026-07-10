import type { User } from 'npm:@supabase/supabase-js@2.49.1';

import { HttpError } from '../_shared/http/responses.ts';

// Denormalized user_roles surface, mirroring send-targeted-message / send-email:
// authorize against the DB role table, not JWT app_metadata claims.
export const SEND_RESULTS_CALLER_ROLE_SELECT =
  'id, club_id, show_id, auth_user_id, is_active, roles!inner(name)';

export interface CallerRoleSource {
  club_id: string | null;
  show_id?: string | null;
  roles?: { name?: string | null } | null;
}

export interface ResultsShowScope {
  id: string;
  club_id: string | null;
  secretary_email: string | null;
}

interface SupabaseQueryResult<T = unknown> {
  data: T | null;
  error: unknown;
}

interface SupabaseQuery<T = unknown> extends PromiseLike<SupabaseQueryResult<T>> {
  select(columns: string): SupabaseQuery<T>;
  eq(column: string, value: unknown): SupabaseQuery<T>;
  maybeSingle(): Promise<SupabaseQueryResult<T>>;
}

export interface SendResultsSupabaseClient {
  from(table: string): SupabaseQuery;
}

/**
 * Pure authorization predicate: does this caller role authorize acting on the
 * results' show? Mirrors send-targeted-message's callerRoleAuthorizesShow —
 * platform/site admins always pass; secretary/trial_secretary pass only when
 * scoped to the show's club or the show itself.
 */
export function callerRoleAuthorizesResults(
  role: CallerRoleSource,
  show: { id: string; club_id: string | null }
): boolean {
  const roleName = role.roles?.name;
  if (roleName === 'platform_admin' || roleName === 'site_admin') return true;
  if (roleName !== 'secretary' && roleName !== 'trial_secretary') return false;
  return role.club_id === show.club_id || role.show_id === show.id;
}

/**
 * Pure address derivation: cc + reply-to are a function of the show record's
 * secretary_email, never of the request body. Returns null when the show has no
 * secretary email on file (the caller then omits cc/reply-to entirely).
 */
export function deriveResultsAddresses(show: { secretary_email: string | null }): {
  secretaryEmail: string | null;
} {
  const trimmed = show.secretary_email?.trim();
  return { secretaryEmail: trimmed ? trimmed : null };
}

/**
 * Fail-closed authorization for send-results. Resolves the results' show, then
 * requires a show-official (secretary/admin) role on it, throwing before the
 * caller can invoke Resend. Returns the resolved show so the handler can derive
 * server-side addresses from the same record.
 */
export async function assertSendResultsAuthorization(args: {
  supabase: SendResultsSupabaseClient;
  user: User | { id: string } | undefined;
  showId: string;
}): Promise<ResultsShowScope> {
  if (!args.user) {
    throw new HttpError(401, 'Unauthorized');
  }

  const { data: show, error: showError } = (await args.supabase
    .from('shows')
    .select('id, club_id, secretary_email')
    .eq('id', args.showId)
    .maybeSingle()) as SupabaseQueryResult<ResultsShowScope>;

  if (showError) {
    throw new HttpError(500, 'Failed to verify results authorization');
  }
  if (!show) {
    throw new HttpError(404, 'Show not found');
  }

  const { data: callerRoles, error: callerRolesError } = await args.supabase
    .from('user_roles')
    .select(SEND_RESULTS_CALLER_ROLE_SELECT)
    .eq('auth_user_id', args.user.id)
    .eq('is_active', true);

  if (callerRolesError) {
    throw new HttpError(500, 'Failed to verify results authorization');
  }

  const canSend = ((callerRoles ?? []) as CallerRoleSource[]).some(role =>
    callerRoleAuthorizesResults(role, show)
  );

  if (!canSend) {
    throw new HttpError(403, 'Forbidden: secretary or admin role required');
  }

  return show;
}
