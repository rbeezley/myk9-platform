import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildDiagnosticBundle } from '../support/supportDiagnostics';
import { buildMockTestSubject, findMockTestTicket, saveMockNote } from './mockShowTickets';

const mockFrom = vi.hoisted(() => vi.fn());
const mockRpc = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase', () => ({
  supabase: { from: mockFrom, rpc: mockRpc },
}));

type Row = Record<string, unknown>;

/** Stubs the tables the support client reads and writes. */
function stubTables(tickets: Row[]) {
  const messageInsert = vi.fn().mockResolvedValue({ error: null });
  const statusUpdate = vi.fn();
  mockFrom.mockImplementation((table: string) => {
    if (table === 'support_ticket_messages') {
      return { insert: messageInsert };
    }
    const result = { data: tickets, error: null };
    const read = {
      eq: vi.fn(),
      order: vi.fn(),
      then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
    };
    read.eq.mockReturnValue(read);
    read.order.mockReturnValue(read);
    return {
      select: () => read,
      update: (row: Row) => {
        statusUpdate(row);
        return { eq: () => Promise.resolve({ error: null }) };
      },
    };
  });
  return { messageInsert, statusUpdate };
}

function ticketRow(overrides: Row = {}): Row {
  return {
    id: 'ticket-1',
    owner_id: 'tester-1',
    subject: 'Mock test · Task 3: Key in 10 mail-in entries',
    status: 'open',
    is_show_day_priority: false,
    diagnostics: { kind: 'mock-test', mockTest: { part: 'task', number: 3 } },
    show_id: null,
    created_at: '2026-12-01T10:00:00Z',
    updated_at: '2026-12-01T10:00:00Z',
    ...overrides,
  };
}

const diagnosticsFor = (mockTest: { part: 'task' | 'closing' | 'free'; number: number | null }) =>
  buildDiagnosticBundle({ userId: 'tester-1', route: '/account/mock-show-test', mockTest });

describe('mock show notes', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('names the task in the subject', () => {
    expect(buildMockTestSubject({ part: 'task', number: 3 }, 'x')).toBe(
      'Mock test · Task 3: Key in 10 mail-in entries'
    );
    expect(buildMockTestSubject({ part: 'closing', number: 1 }, 'x')).toContain(
      'Closing question 1: Would you run a real show on this?'
    );
    expect(buildMockTestSubject({ part: 'free' }, 'The cart froze. Twice.')).toBe(
      'Mock test · Note: The cart froze.'
    );
  });

  it('a first note on a task creates ONE ticket with the task in the subject and the note as the body', async () => {
    stubTables([]);
    mockRpc.mockResolvedValue({ data: [{ id: 'new-ticket' }], error: null });

    const result = await saveMockNote({
      ownerId: 'tester-1',
      target: { part: 'task', number: 3 },
      body: '  The Add entry button was hard to find.  ',
      diagnostics: diagnosticsFor({ part: 'task', number: 3 }),
    });

    expect(result).toEqual({ ticketId: 'new-ticket' });
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('create_support_ticket', {
      p_owner_id: 'tester-1',
      p_subject: 'Mock test · Task 3: Key in 10 mail-in entries',
      p_diagnostics: expect.objectContaining({
        kind: 'mock-test',
        mockTest: { part: 'task', number: 3 },
      }),
      p_show_id: null,
      p_is_show_day_priority: false,
      p_body: 'The Add entry button was hard to find.',
    });
  });

  it('a second note on the same task adds a message to that ticket and opens no other', async () => {
    const { messageInsert } = stubTables([ticketRow()]);

    const result = await saveMockNote({
      ownerId: 'tester-1',
      target: { part: 'task', number: 3 },
      body: 'Also, the cheque field lost my typing.',
      diagnostics: diagnosticsFor({ part: 'task', number: 3 }),
    });

    expect(result).toEqual({ ticketId: 'ticket-1' });
    expect(mockRpc).not.toHaveBeenCalled();
    expect(messageInsert).toHaveBeenCalledWith({
      ticket_id: 'ticket-1',
      sender_id: 'tester-1',
      body: 'Also, the cheque field lost my typing.',
      is_from_operator: false,
    });
  });

  it("another task's ticket, or another person's, is never appended to", async () => {
    stubTables([
      ticketRow({
        id: 'task-4',
        diagnostics: { kind: 'mock-test', mockTest: { part: 'task', number: 4 } },
      }),
      ticketRow({ id: 'someone-else', owner_id: 'tester-2' }),
    ]);
    mockRpc.mockResolvedValue({ data: [{ id: 'new-ticket' }], error: null });

    const result = await saveMockNote({
      ownerId: 'tester-1',
      target: { part: 'task', number: 3 },
      body: 'New task, new ticket.',
      diagnostics: diagnosticsFor({ part: 'task', number: 3 }),
    });

    expect(result).toEqual({ ticketId: 'new-ticket' });
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it('a free note always opens its own ticket and never reads the ticket list', async () => {
    stubTables([ticketRow()]);
    mockRpc.mockResolvedValue({ data: [{ id: 'free-1' }], error: null });

    await saveMockNote({
      ownerId: 'tester-1',
      target: { part: 'free' },
      body: 'The header covers the Save button on my phone.',
      diagnostics: diagnosticsFor({ part: 'free', number: null }),
    });

    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockRpc).toHaveBeenCalledWith(
      'create_support_ticket',
      expect.objectContaining({
        p_subject: 'Mock test · Note: The header covers the Save button on my phone.',
        p_is_show_day_priority: false,
      })
    );
  });

  it('saves nothing when the ticket list cannot be read, so a task never gets two tickets', async () => {
    mockFrom.mockImplementation(() => {
      const failed = { data: null, error: { message: 'offline' } };
      const read = {
        order: vi.fn(),
        then: (resolve: (value: typeof failed) => unknown) => Promise.resolve(failed).then(resolve),
      };
      read.order.mockReturnValue(read);
      return { select: () => read };
    });

    await expect(
      saveMockNote({
        ownerId: 'tester-1',
        target: { part: 'task', number: 3 },
        body: 'A note',
        diagnostics: diagnosticsFor({ part: 'task', number: 3 }),
      })
    ).rejects.toThrow('offline');
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('refuses an empty note', async () => {
    await expect(
      saveMockNote({
        ownerId: 'tester-1',
        target: { part: 'free' },
        body: '   ',
        diagnostics: diagnosticsFor({ part: 'free', number: null }),
      })
    ).rejects.toThrow('Write a note');
  });

  it('finds only the owner’s mock-test ticket for that target', () => {
    const base = {
      subject: 's',
      status: 'open' as const,
      isShowDayPriority: false,
      showId: null,
      createdAt: '',
      updatedAt: '',
    };
    const tickets = [
      {
        ...base,
        id: 'a',
        ownerId: 'tester-1',
        diagnostics: { kind: 'mock-test', mockTest: { part: 'closing', number: 2 } },
      },
      { ...base, id: 'b', ownerId: 'tester-1', diagnostics: { route: '/x' } },
    ] as never;
    expect(findMockTestTicket(tickets, 'tester-1', { part: 'closing', number: 2 })?.id).toBe('a');
    expect(findMockTestTicket(tickets, 'tester-1', { part: 'closing', number: 1 })).toBeNull();
    expect(findMockTestTicket(tickets, 'tester-2', { part: 'closing', number: 2 })).toBeNull();
  });
});
