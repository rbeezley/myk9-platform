/**
 * Support inbox views: the status pills, as list-toolkit views. A `null` count
 * means the ticket query has not produced data (loading or failed), so the
 * picker shows "—" instead of a "0" that would read as an empty inbox.
 */
import type { ListView } from '@/components/list-toolkit';
import type { SupportTicket, SupportTicketStatus } from '@/features/support/supportTickets';

export type SupportTicketFilter = SupportTicketStatus | 'all';

export const SUPPORT_FILTERS: readonly SupportTicketFilter[] = [
  'open',
  'waiting',
  'resolved',
  'all',
];
export const DEFAULT_SUPPORT_FILTER: SupportTicketFilter = 'open';

export const SUPPORT_STATUS_LABELS: Record<SupportTicketFilter, string> = {
  open: 'Open',
  waiting: 'Waiting',
  resolved: 'Resolved',
  all: 'All',
};

export const SUPPORT_TICKET_NOUN = ['ticket', 'tickets'] as const;

export function filterTickets(
  tickets: SupportTicket[],
  filter: SupportTicketFilter
): SupportTicket[] {
  return filter === 'all' ? tickets : tickets.filter(ticket => ticket.status === filter);
}

/** `tickets` is null while the data is unavailable; every count is then unknown. */
export function buildSupportViews(tickets: SupportTicket[] | null): ListView[] {
  return SUPPORT_FILTERS.map(filter => ({
    id: filter,
    label: SUPPORT_STATUS_LABELS[filter],
    count: tickets === null ? null : filterTickets(tickets, filter).length,
  }));
}
