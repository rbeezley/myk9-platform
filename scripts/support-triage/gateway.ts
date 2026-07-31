import { createClient } from '@supabase/supabase-js';
import type { SupportMessage, SupportTicket, TicketThread } from './types';

export interface SupportDataSource {
  openTickets(): Promise<SupportTicket[]>;
  messagesFor(ticketIds: string[]): Promise<SupportMessage[]>;
  insertOperatorMessage(ticketId: string, senderId: string, body: string): Promise<void>;
}

const TICKET_COLUMNS = 'id, owner_id, subject, status, is_show_day_priority, show_id, created_at';
const MESSAGE_COLUMNS = 'id, ticket_id, sender_id, body, is_from_operator, created_at';

export function createSupabaseSource(url: string, serviceRoleKey: string): SupportDataSource {
  const client = createClient(url, serviceRoleKey, { auth: { persistSession: false } });

  return {
    async openTickets() {
      const { data, error } = await client
        .from('support_tickets')
        .select(TICKET_COLUMNS)
        .in('status', ['open', 'waiting'])
        .order('created_at', { ascending: false });
      if (error) throw new Error(`Failed to read support_tickets: ${error.message}`);
      return (data ?? []) as SupportTicket[];
    },

    async messagesFor(ticketIds) {
      if (ticketIds.length === 0) return [];
      const { data, error } = await client
        .from('support_ticket_messages')
        .select(MESSAGE_COLUMNS)
        .in('ticket_id', ticketIds)
        .order('created_at', { ascending: true });
      if (error) throw new Error(`Failed to read support_ticket_messages: ${error.message}`);
      return (data ?? []) as SupportMessage[];
    },

    async insertOperatorMessage(ticketId, senderId, body) {
      const { error } = await client
        .from('support_ticket_messages')
        .insert({ ticket_id: ticketId, sender_id: senderId, body, is_from_operator: true });
      if (error) throw new Error(`Failed to insert operator message: ${error.message}`);
    },
  };
}

export function buildThreads(tickets: SupportTicket[], messages: SupportMessage[]): TicketThread[] {
  const byTicket = new Map<string, SupportMessage[]>();
  for (const message of messages) {
    byTicket.set(message.ticket_id, [...(byTicket.get(message.ticket_id) ?? []), message]);
  }
  return tickets.map(ticket => ({ ticket, messages: byTicket.get(ticket.id) ?? [] }));
}

export function needsReply(thread: TicketThread): boolean {
  const last = latestMessage(thread.messages);
  if (!last) return false;
  return !last.is_from_operator;
}

// INTENT: The idempotency guard is a live re-read of the thread, not local state.
// Losing the state file must cause redundant work, never a duplicate reply to a
// real exhibitor. An empty live thread is treated as "do not send" — if we cannot
// see the message we are answering, we do not answer.
export async function sendOperatorReply(
  thread: TicketThread,
  body: string,
  senderId: string,
  source: SupportDataSource
): Promise<'sent' | 'skipped_already_answered'> {
  const live = await source.messagesFor([thread.ticket.id]);
  const last = latestMessage(live);
  if (!last || last.is_from_operator) return 'skipped_already_answered';

  await source.insertOperatorMessage(thread.ticket.id, senderId, body);
  return 'sent';
}

function latestMessage(messages: SupportMessage[]): SupportMessage | null {
  if (messages.length === 0) return null;
  const ordered = [...messages].sort((a, b) => a.created_at.localeCompare(b.created_at));
  return ordered[ordered.length - 1] ?? null;
}
