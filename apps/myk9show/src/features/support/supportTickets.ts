import { supabase } from '@/lib/supabase';
import type { SupportDiagnosticBundle } from './supportDiagnostics';

export interface CreateSupportTicketInput {
  ownerId: string;
  body: string;
  diagnostics: SupportDiagnosticBundle;
  showId: string | null;
  isShowDayPriority: boolean;
}

export interface CreatedSupportTicket {
  id: string;
}

export type SupportTicketStatus = 'open' | 'waiting' | 'resolved';

export interface SupportTicket {
  id: string;
  ownerId: string;
  ownerName?: string | undefined;
  ownerEmail?: string | undefined;
  subject: string;
  status: SupportTicketStatus;
  isShowDayPriority: boolean;
  diagnostics: SupportDiagnosticBundle;
  showId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupportTicketMessage {
  id: string;
  ticketId: string;
  senderId: string;
  body: string;
  isFromOperator: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface ListSupportTicketsOptions {
  resolveOwners?: boolean;
}

type SupportTableClient = {
  rpc: (
    fn: 'create_support_ticket',
    args: Record<string, unknown>
  ) => PromiseLike<{ data: Array<{ id: string }> | null; error: { message: string } | null }>;
  from: (table: 'people' | 'support_tickets' | 'support_ticket_messages') => {
    select: (columns: string) => SupportQueryBuilder;
    insert: (row: Record<string, unknown>) => {
      select: (columns: string) => {
        single: () => Promise<{ data: { id: string } | null; error: { message: string } | null }>;
      };
    } & PromiseLike<{ error: { message: string } | null }>;
    update: (row: Record<string, unknown>) => SupportQueryBuilder;
  };
};

type SupportQueryBuilder = PromiseLike<{
  data: Record<string, unknown>[] | null;
  error: { message: string } | null;
}> & {
  eq: (column: string, value: unknown) => SupportQueryBuilder;
  neq: (column: string, value: unknown) => SupportQueryBuilder;
  in: (column: string, values: string[]) => SupportQueryBuilder;
  is: (column: string, value: null) => SupportQueryBuilder;
  order: (column: string, options?: { ascending?: boolean }) => SupportQueryBuilder;
};

const TICKET_COLUMNS =
  'id, owner_id, subject, status, is_show_day_priority, diagnostics, show_id, created_at, updated_at';
const MESSAGE_COLUMNS = 'id, ticket_id, sender_id, body, is_from_operator, read_at, created_at';

export async function createSupportTicket(
  input: CreateSupportTicketInput
): Promise<CreatedSupportTicket> {
  const body = input.body.trim();
  if (!body) throw new Error('Add a short note before sending.');

  const client = supabase as unknown as SupportTableClient;
  const { data: ticket, error: ticketError } = await client.rpc('create_support_ticket', {
    p_owner_id: input.ownerId,
    p_subject: buildTicketSubject(body),
    p_diagnostics: input.diagnostics,
    p_show_id: input.showId,
    p_is_show_day_priority: input.isShowDayPriority,
    p_body: body,
  });

  if (ticketError || !ticket?.[0]?.id) {
    throw new Error(ticketError?.message ?? 'Could not create the support ticket.');
  }

  return { id: ticket[0].id };
}

export async function listSupportTickets(
  status?: SupportTicketStatus,
  options?: ListSupportTicketsOptions
): Promise<SupportTicket[]> {
  const client = supabase as unknown as SupportTableClient;
  let query = client
    .from('support_tickets')
    .select(TICKET_COLUMNS)
    .order('is_show_day_priority', { ascending: false })
    .order('created_at', { ascending: false });
  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const tickets = (data ?? []).map(mapSupportTicket);
  if (!options?.resolveOwners) return tickets;

  const ownerIds = [...new Set(tickets.map(ticket => ticket.ownerId))];
  if (ownerIds.length === 0) return tickets;

  const { data: people, error: peopleError } = await client
    .from('people')
    .select('auth_user_id, first_name, last_name, email')
    .in('auth_user_id', ownerIds);
  if (peopleError) return tickets;

  const owners = new Map<string, { name: string; email: string }>();
  for (const person of people ?? []) {
    const firstName = typeof person.first_name === 'string' ? person.first_name.trim() : '';
    const lastName = typeof person.last_name === 'string' ? person.last_name.trim() : '';
    owners.set(String(person.auth_user_id), {
      name: [firstName, lastName].filter(Boolean).join(' '),
      email: typeof person.email === 'string' ? person.email.trim() : '',
    });
  }

  return tickets.map(ticket => {
    const owner = owners.get(ticket.ownerId);
    if (!owner) return ticket;
    return {
      ...ticket,
      ...(owner.name ? { ownerName: owner.name } : {}),
      ...(owner.email ? { ownerEmail: owner.email } : {}),
    };
  });
}

export async function listSupportTicketMessages(ticketId: string): Promise<SupportTicketMessage[]> {
  const client = supabase as unknown as SupportTableClient;
  const { data, error } = await client
    .from('support_ticket_messages')
    .select(MESSAGE_COLUMNS)
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map(mapSupportTicketMessage);
}

export async function postSupportTicketMessage(input: {
  ticketId: string;
  senderId: string;
  body: string;
  isFromOperator: boolean;
}): Promise<void> {
  const body = input.body.trim();
  if (!body) throw new Error('Add a reply before sending.');

  const client = supabase as unknown as SupportTableClient;
  const { error } = await client.from('support_ticket_messages').insert({
    ticket_id: input.ticketId,
    sender_id: input.senderId,
    body,
    is_from_operator: input.isFromOperator,
  });
  if (error) throw new Error(error.message);

  await updateSupportTicketStatus(input.ticketId, input.isFromOperator ? 'waiting' : 'open');
}

export async function markSupportTicketMessagesRead(
  ticketId: string,
  readerId: string
): Promise<void> {
  const client = supabase as unknown as SupportTableClient;
  const { error } = await client
    .from('support_ticket_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('ticket_id', ticketId)
    .neq('sender_id', readerId)
    .is('read_at', null);
  if (error) throw new Error(error.message);
}

export async function updateSupportTicketStatus(
  ticketId: string,
  status: SupportTicketStatus
): Promise<void> {
  const client = supabase as unknown as SupportTableClient;
  const { error } = await client.from('support_tickets').update({ status }).eq('id', ticketId);
  if (error) throw new Error(error.message);
}

export function buildTicketSubject(body: string): string {
  const firstLine = body.split(/\r?\n/)[0]?.trim() ?? '';
  const sentence = firstLine.split(/(?<=[.!?])\s+/)[0]?.trim() ?? firstLine;
  const subject = sentence || 'Support request';
  return subject.length > 200 ? `${subject.slice(0, 197)}...` : subject;
}

function mapSupportTicket(row: Record<string, unknown>): SupportTicket {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    subject: String(row.subject),
    status: row.status as SupportTicketStatus,
    isShowDayPriority: row.is_show_day_priority === true,
    diagnostics: row.diagnostics as SupportDiagnosticBundle,
    showId: typeof row.show_id === 'string' ? row.show_id : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapSupportTicketMessage(row: Record<string, unknown>): SupportTicketMessage {
  return {
    id: String(row.id),
    ticketId: String(row.ticket_id),
    senderId: String(row.sender_id),
    body: String(row.body),
    isFromOperator: row.is_from_operator === true,
    readAt: typeof row.read_at === 'string' ? row.read_at : null,
    createdAt: String(row.created_at),
  };
}
