import { createClient } from '@supabase/supabase-js';
import type { SupportMessage, SupportTicket, TicketThread } from './types';

export interface SupportDataSource {
  openTickets(): Promise<SupportTicket[]>;
  messagesFor(ticketIds: string[]): Promise<SupportMessage[]>;
  insertOperatorMessage(ticketId: string, senderId: string, body: string): Promise<void>;
  updateTicketStatus(ticketId: string, status: SupportTicket['status']): Promise<void>;
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

    async updateTicketStatus(ticketId, status) {
      const { error } = await client
        .from('support_tickets')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', ticketId);
      if (error) throw new Error(`Failed to update ticket status: ${error.message}`);
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

export type SendResult = 'sent' | 'skipped_already_answered' | 'skipped_guard_rejected';

// INTENT: The idempotency guard is a live re-read of the thread, not local state.
// Losing the state file must cause redundant work, never a duplicate reply to a
// real exhibitor. An empty live thread is treated as "do not send" — if we cannot
// see the message we are answering, we do not answer.
//
// INTENT: `guard` re-evaluates the caller's send preconditions against the FRESH
// thread. Without it the carve-out check in runPass is a stale snapshot taken before
// the classification round-trip: an exhibitor who replies "actually I want a refund"
// while we are classifying would still receive the canned answer, because the
// last-message check alone reads "operator answered, then exhibitor came back" as
// permission to send. Callers must pass the same predicate they gated on.
//
// `body` is trusted to be operator-authored. The only caller passes a `reply` string
// looked up from the CANNED_ANSWERS registry by id; never pass model-authored text.
export async function sendOperatorReply(
  thread: TicketThread,
  body: string,
  senderId: string,
  source: SupportDataSource,
  guard: (fresh: TicketThread) => boolean = () => true
): Promise<SendResult> {
  const live = await source.messagesFor([thread.ticket.id]);
  const last = latestMessage(live);
  if (!last || last.is_from_operator) return 'skipped_already_answered';

  const fresh: TicketThread = { ticket: thread.ticket, messages: live };
  if (!guard(fresh)) return 'skipped_guard_rejected';

  await source.insertOperatorMessage(thread.ticket.id, senderId, body);
  // Mirrors postSupportTicketMessage in the inbox, which sets 'waiting' after an
  // operator reply. Without this an auto-answered ticket stays 'open' and keeps
  // counting toward same-show cluster alerts.
  await source.updateTicketStatus(thread.ticket.id, 'waiting');
  return 'sent';
}

function latestMessage(messages: SupportMessage[]): SupportMessage | null {
  if (messages.length === 0) return null;
  const ordered = [...messages].sort((a, b) => a.created_at.localeCompare(b.created_at));
  return ordered[ordered.length - 1] ?? null;
}
