import type { User } from 'npm:@supabase/supabase-js@2.49.1';

import { HttpError } from '../_shared/http/responses.ts';

export const SEND_EMAIL_CALLER_ROLE_SELECT =
  'id, club_id, show_id, auth_user_id, is_active, roles!inner(name)';

export interface SendEmailAuthData {
  type?: string;
  registrationId?: string;
  ticketId?: string;
}

export interface CallerRoleSource {
  club_id: string | null;
  show_id?: string | null;
  roles?: { name?: string | null } | null;
}

interface ShowScope {
  id: string;
  club_id: string | null;
}

interface RegistrationRow {
  id: string;
  show?: ShowScope | ShowScope[] | null;
}

interface SupabaseQueryResult<T = unknown> {
  data: T | null;
  error: unknown;
}

interface SupabaseQuery<T = unknown> extends PromiseLike<SupabaseQueryResult<T>> {
  select(columns: string): SupabaseQuery<T>;
  eq(column: string, value: unknown): SupabaseQuery<T>;
  in(column: string, values: readonly unknown[]): SupabaseQuery<T>;
  maybeSingle(): Promise<SupabaseQueryResult<T>>;
}

export interface SendEmailSupabaseClient {
  from(table: string): SupabaseQuery;
  rpc(name: string, args: Record<string, unknown>): Promise<SupabaseQueryResult<unknown>>;
}

export function callerRoleAuthorizesEmailShow(role: CallerRoleSource, show: ShowScope): boolean {
  const roleName = role.roles?.name;
  if (roleName === 'platform_admin' || roleName === 'site_admin') return true;
  if (roleName !== 'secretary' && roleName !== 'trial_secretary') return false;
  return role.club_id === show.club_id || role.show_id === show.id;
}

function normalizeJoinedShow(show: RegistrationRow['show']): ShowScope | null {
  if (Array.isArray(show)) return show[0] ?? null;
  return show ?? null;
}

export async function assertSendEmailRateLimit(args: {
  supabase: SendEmailSupabaseClient;
  userId: string;
}): Promise<void> {
  const { data, error } = await args.supabase.rpc('check_login_rate_limit', {
    p_ip_address: args.userId,
  });

  if (error) {
    console.error('send-email rate limit check failed', error);
    // Deliberate show-day availability tradeoff: this mirrors validate-passcode.
    // Abuse blocking must not strand secretaries if the limiter RPC is unhealthy;
    // the authorization check below still gates who can send.
    return;
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    { allowed?: boolean; message?: string; blocked_until?: string } | undefined;

  if (row?.allowed === false) {
    throw new HttpError(429, row.message ?? 'Rate limit exceeded', 'rate_limited');
  }
}

export async function assertSendEmailAuthorization(args: {
  supabase: SendEmailSupabaseClient;
  user: User | { id: string } | undefined;
  data: SendEmailAuthData;
}): Promise<void> {
  if (!args.user) {
    throw new HttpError(401, 'Unauthorized');
  }

  if (args.data.type === 'support_notification') {
    await assertSupportNotificationAuthorization(args);
    return;
  }

  if (args.data.type !== 'entry_decision') {
    throw new HttpError(403, 'Forbidden: show official role required');
  }

  if (!args.data.registrationId) {
    throw new HttpError(400, 'registrationId is required');
  }

  const { data: registration, error: registrationError } = (await args.supabase
    .from('enrollments')
    .select('id, show:shows(id, club_id)')
    .eq('id', args.data.registrationId)
    .maybeSingle()) as SupabaseQueryResult<RegistrationRow>;

  if (registrationError) {
    throw new HttpError(500, 'Failed to verify email authorization');
  }

  const show = normalizeJoinedShow(registration?.show);
  if (!registration || !show) {
    throw new HttpError(404, 'Registration not found');
  }

  const { data: callerRoles, error: callerRolesError } = await args.supabase
    .from('user_roles')
    .select(SEND_EMAIL_CALLER_ROLE_SELECT)
    .eq('auth_user_id', args.user.id)
    .eq('is_active', true);

  if (callerRolesError) {
    throw new HttpError(500, 'Failed to verify email authorization');
  }

  const canSend = ((callerRoles ?? []) as CallerRoleSource[]).some(role =>
    callerRoleAuthorizesEmailShow(role, show)
  );

  if (!canSend) {
    throw new HttpError(403, 'Forbidden: show official role required');
  }
}

async function assertSupportNotificationAuthorization(args: {
  supabase: SendEmailSupabaseClient;
  user: User | { id: string } | undefined;
  data: SendEmailAuthData;
}): Promise<void> {
  if (!args.data.ticketId) {
    throw new HttpError(400, 'ticketId is required');
  }

  const { data: ticket, error: ticketError } = (await args.supabase
    .from('support_tickets')
    .select('id, owner_id')
    .eq('id', args.data.ticketId)
    .maybeSingle()) as SupabaseQueryResult<{ id: string; owner_id: string }>;

  if (ticketError) {
    throw new HttpError(500, 'Failed to verify support email authorization');
  }
  if (!ticket) {
    throw new HttpError(404, 'Support ticket not found');
  }
  if (ticket.owner_id === args.user?.id) return;

  const { data: callerRoles, error: callerRolesError } = await args.supabase
    .from('user_roles')
    .select(SEND_EMAIL_CALLER_ROLE_SELECT)
    .eq('auth_user_id', args.user?.id)
    .eq('is_active', true);

  if (callerRolesError) {
    throw new HttpError(500, 'Failed to verify support email authorization');
  }

  const isSiteAdmin = ((callerRoles ?? []) as CallerRoleSource[]).some(
    role => role.roles?.name === 'site_admin'
  );
  if (!isSiteAdmin) {
    throw new HttpError(403, 'Forbidden: support ticket access required');
  }
}
