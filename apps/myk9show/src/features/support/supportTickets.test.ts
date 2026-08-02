import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTicketSubject, listSupportTickets } from './supportTickets';

const mockFrom = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase', () => ({
  supabase: { from: mockFrom },
}));

function makeQuery(result: { data: Record<string, unknown>[]; error: null }) {
  const query = {
    select: vi.fn(),
    order: vi.fn(),
    in: vi.fn(),
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  };
  query.select.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.in.mockReturnValue(query);
  return query;
}

describe('support tickets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds a concise ticket subject from the first sentence', () => {
    expect(buildTicketSubject('My armband is missing. I checked My Entries.')).toBe(
      'My armband is missing.'
    );
  });

  it('truncates long subjects to fit the database check', () => {
    const subject = buildTicketSubject('A'.repeat(240));

    expect(subject).toHaveLength(200);
    expect(subject.endsWith('...')).toBe(true);
  });

  it('resolves ticket owners from people and preserves unresolved fallbacks', async () => {
    const ticketQuery = makeQuery({
      data: [
        {
          id: 'ticket-1',
          owner_id: 'owner-1',
          subject: 'Missing armband',
          status: 'open',
          is_show_day_priority: true,
          diagnostics: {},
          show_id: null,
          created_at: '2026-08-02T12:00:00.000Z',
          updated_at: '2026-08-02T12:01:00.000Z',
        },
        {
          id: 'ticket-2',
          owner_id: 'owner-unresolved',
          subject: 'Unknown owner',
          status: 'open',
          is_show_day_priority: false,
          diagnostics: {},
          show_id: null,
          created_at: '2026-08-02T12:00:00.000Z',
          updated_at: '2026-08-02T12:01:00.000Z',
        },
      ],
      error: null,
    });
    const peopleQuery = makeQuery({
      data: [
        {
          auth_user_id: 'owner-1',
          first_name: 'Jane',
          last_name: 'Exhibitor',
          email: 'jane@example.com',
        },
      ],
      error: null,
    });
    mockFrom.mockImplementation((table: string) =>
      table === 'support_tickets' ? ticketQuery : peopleQuery
    );

    const tickets = await listSupportTickets();

    expect(peopleQuery.in).toHaveBeenCalledWith('auth_user_id', ['owner-1', 'owner-unresolved']);
    expect(tickets[0]).toMatchObject({
      ownerName: 'Jane Exhibitor',
      ownerEmail: 'jane@example.com',
    });
    expect(tickets[1]).not.toHaveProperty('ownerName');
    expect(tickets[1]).not.toHaveProperty('ownerEmail');
  });
});
