import type { SupportTicket } from './types';

export interface TicketCluster {
  showId: string | null;
  ticketIds: string[];
  newestCreatedAt: string;
}

// INTENT: This is an outage detector assembled from human reports. Several exhibitors
// at one show reporting trouble inside an hour is a signal system_health_snapshots
// cannot produce, because it measures "users are blocked", not "the server responds".
export function detectClusters(
  tickets: SupportTicket[],
  now: Date,
  windowMinutes = 60,
  minSize = 3
): TicketCluster[] {
  const cutoff = now.getTime() - windowMinutes * 60_000;

  // Tickets with no show_id are deliberately excluded: without a shared show there is
  // no reason to think two tickets describe the same failure.
  const recent = tickets.filter(
    ticket => ticket.show_id !== null && Date.parse(ticket.created_at) >= cutoff
  );

  const byShow = new Map<string, SupportTicket[]>();
  for (const ticket of recent) {
    const showId = ticket.show_id as string;
    byShow.set(showId, [...(byShow.get(showId) ?? []), ticket]);
  }

  const clusters: TicketCluster[] = [];
  for (const [showId, group] of byShow) {
    if (group.length < minSize) continue;
    const newestFirst = [...group].sort((a, b) => b.created_at.localeCompare(a.created_at));
    clusters.push({
      showId,
      ticketIds: newestFirst.map(ticket => ticket.id),
      newestCreatedAt: newestFirst[0].created_at,
    });
  }
  return clusters;
}
