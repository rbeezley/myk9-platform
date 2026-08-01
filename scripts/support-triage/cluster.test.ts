import { describe, expect, it } from 'vitest';
import { detectClusters } from './cluster';
import type { SupportTicket } from './types';

const NOW = new Date('2026-08-01T12:00:00.000Z');

function ticket(id: string, showId: string | null, minutesAgo: number): SupportTicket {
  return {
    id,
    owner_id: `owner-${id}`,
    subject: 'Scoring is broken',
    status: 'open',
    is_show_day_priority: false,
    show_id: showId,
    created_at: new Date(NOW.getTime() - minutesAgo * 60_000).toISOString(),
  };
}

describe('detectClusters', () => {
  it('returns nothing when fewer than three tickets share a show', () => {
    const tickets = [ticket('a', 'show-1', 5), ticket('b', 'show-1', 10)];
    expect(detectClusters(tickets, NOW)).toEqual([]);
  });

  it('flags three tickets on the same show within the hour', () => {
    const tickets = [
      ticket('a', 'show-1', 5),
      ticket('b', 'show-1', 20),
      ticket('c', 'show-1', 50),
    ];
    const clusters = detectClusters(tickets, NOW);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].showId).toBe('show-1');
    expect([...clusters[0].ticketIds].sort()).toEqual(['a', 'b', 'c']);
  });

  it('does not cluster tickets across different shows', () => {
    const tickets = [
      ticket('a', 'show-1', 5),
      ticket('b', 'show-2', 10),
      ticket('c', 'show-3', 15),
    ];
    expect(detectClusters(tickets, NOW)).toEqual([]);
  });

  it('never clusters tickets with no show', () => {
    const tickets = [ticket('a', null, 5), ticket('b', null, 10), ticket('c', null, 15)];
    expect(detectClusters(tickets, NOW)).toEqual([]);
  });

  it('ignores tickets older than the window', () => {
    const tickets = [
      ticket('a', 'show-1', 5),
      ticket('b', 'show-1', 20),
      ticket('c', 'show-1', 400),
    ];
    expect(detectClusters(tickets, NOW)).toEqual([]);
  });

  it('reports the newest ticket timestamp so callers can suppress repeat alerts', () => {
    const tickets = [
      ticket('a', 'show-1', 5),
      ticket('b', 'show-1', 20),
      ticket('c', 'show-1', 50),
    ];
    expect(detectClusters(tickets, NOW)[0].newestCreatedAt).toBe(
      new Date(NOW.getTime() - 5 * 60_000).toISOString()
    );
  });

  it('reports each show separately when two shows both burst', () => {
    const tickets = [
      ticket('a', 'show-1', 5),
      ticket('b', 'show-1', 10),
      ticket('c', 'show-1', 15),
      ticket('d', 'show-2', 5),
      ticket('e', 'show-2', 10),
      ticket('f', 'show-2', 15),
    ];
    const clusters = detectClusters(tickets, NOW);
    expect(clusters).toHaveLength(2);
    expect(clusters.map(cluster => cluster.showId).sort()).toEqual(['show-1', 'show-2']);
  });

  it('returns an empty list for an empty queue', () => {
    expect(detectClusters([], NOW)).toEqual([]);
  });
});
