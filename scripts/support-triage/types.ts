export type CarveOutReason = 'payment_or_refund' | 'show_day_priority' | 'repeat_question';

export interface SupportTicket {
  id: string;
  owner_id: string;
  subject: string;
  status: 'open' | 'waiting' | 'resolved';
  is_show_day_priority: boolean;
  show_id: string | null;
  created_at: string;
}

export interface SupportMessage {
  id: string;
  ticket_id: string;
  sender_id: string;
  body: string;
  is_from_operator: boolean;
  created_at: string;
}

export interface TicketThread {
  ticket: SupportTicket;
  messages: SupportMessage[];
}

/** The person who opened a ticket, resolved from public.people. */
export interface TicketOwner {
  auth_user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}
