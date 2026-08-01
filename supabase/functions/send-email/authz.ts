import type { User } from 'npm:@supabase/supabase-js@2.49.1';

import { HttpError } from '../_shared/http/responses.ts';
import { applyActiveRoleValidity } from '../_shared/roleValidity.ts';
import type {
  EntryDecisionRecipientSource,
  SupportNotificationRecipientSource,
} from './recipientResolution.ts';

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
  cc_secretary_on_exhibitor_emails?: boolean | null;
  secretary_email?: string | null;
}

interface HandlerScope {
  email: string | null;
}

interface RegistrationRow {
  id: string;
  show?: ShowScope | ShowScope[] | null;
  handler?: HandlerScope | HandlerScope[] | null;
}

interface SupabaseQueryResult<T = unknown> {
  data: T | null;
  error: unknown;
}

interface SupabaseQuery<T = unknown> extends PromiseLike<SupabaseQueryResult<T>> {
  select(columns: string): SupabaseQuery<T>;
  eq(column: string, value: unknown): SupabaseQuery<T>;
  in(column: string, values: readonly unknown[]): SupabaseQuery<T>;
  or(filters: string): SupabaseQuery<T>;
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

function normalizeJoinedHandlerEmail(handler: RegistrationRow['handler']): string | null {
  const row = Array.isArray(handler) ? (handler[0] ?? null) : (handler ?? null);
  return row?.email ?? null;
}

/**
 * Result of a successful authorization check, for message types whose
 * recipient must be derived from the resource (SA-018/SA-019). `undefined`
 * for other message types, which keep their existing body-supplied `to`.
 */
export type SendEmailAuthorizationResult =
  SupportNotificationRecipientSource | EntryDecisionRecipientSource | undefined;

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
}): Promise<SendEmailAuthorizationResult> {
  if (!args.user) {
    throw new HttpError(401, 'Unauthorized');
  }

  if (args.data.type === 'support_notification') {
    return await assertSupportNotificationAuthorization(args);
  }

  if (args.data.type !== 'entry_decision') {
    throw new HttpError(403, 'Forbidden: show official role required');
  }

  if (!args.data.registrationId) {
    throw new HttpError(400, 'registrationId is required');
  }

  const { data: registration, error: registrationError } = (await args.supabase
    .from('enrollments')
    .select(
      'id, show:shows(id, club_id, cc_secretary_on_exhibitor_emails, secretary_email), handler:people!handler_id(email)'
    )
    .eq('id', args.data.registrationId)
    .maybeSingle()) as SupabaseQueryResult<RegistrationRow>;

  if (registrationError) {
    throw new HttpError(500, 'Failed to verify email authorization');
  }

  const show = normalizeJoinedShow(registration?.show);
  if (!registration || !show) {
    throw new HttpError(404, 'Registration not found');
  }

  const { data: callerRoles, error: callerRolesError } = await applyActiveRoleValidity(
    args.supabase
      .from('user_roles')
      .select(SEND_EMAIL_CALLER_ROLE_SELECT)
      .eq('auth_user_id', args.user.id)
  );

  if (callerRolesError) {
    throw new HttpError(500, 'Failed to verify email authorization');
  }

  const canSend = ((callerRoles ?? []) as CallerRoleSource[]).some(role =>
    callerRoleAuthorizesEmailShow(role, show)
  );

  if (!canSend) {
    throw new HttpError(403, 'Forbidden: show official role required');
  }

  return {
    type: 'entry_decision',
    registration: {
      exhibitorEmail: normalizeJoinedHandlerEmail(registration.handler),
      show: {
        ccSecretaryOnExhibitorEmails: show.cc_secretary_on_exhibitor_emails ?? null,
        secretaryEmail: show.secretary_email ?? null,
      },
    },
  };
}

async function assertSupportNotificationAuthorization(args: {
  supabase: SendEmailSupabaseClient;
  user: User | { id: string } | undefined;
  data: SendEmailAuthData;
}): Promise<SupportNotificationRecipientSource> {
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

  if (ticket.owner_id !== args.user?.id) {
    const { data: callerRoles, error: callerRolesError } = await applyActiveRoleValidity(
      args.supabase
        .from('user_roles')
        .select(SEND_EMAIL_CALLER_ROLE_SELECT)
        .eq('auth_user_id', args.user?.id)
    );

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

  const ownerEmail = await resolveTicketOwnerEmail(args.supabase, ticket.owner_id);

  return { type: 'support_notification', ticket: { ownerEmail } };
}

/** The ticket's `owner_id` is an `auth.users.id`; resolve it to an email via
 * the `people` row linked by `auth_user_id`, matching the pattern used by
 * `push-trigger-support-message`'s `getOwnerRecipient`. */
async function resolveTicketOwnerEmail(
  supabase: SendEmailSupabaseClient,
  ownerId: string
): Promise<string | null> {
  const { data: owner, error } = (await supabase
    .from('people')
    .select('email')
    .eq('auth_user_id', ownerId)
    .maybeSingle()) as SupabaseQueryResult<{ email: string | null }>;

  if (error) {
    throw new HttpError(500, 'Failed to resolve support ticket recipient');
  }

  return owner?.email ?? null;
}
