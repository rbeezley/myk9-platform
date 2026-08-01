import { describe, expect, it, vi } from 'vitest';
import { buildThreads, needsReply, sendOperatorReply } from './gateway';
import type { SupportMessage, SupportTicket, TicketThread } from './types';

const TICKET: SupportTicket = {
  id: 'ticket-1',
  owner_id: 'owner-1',
  subject: 'Question',
  status: 'open',
  is_show_day_priority: false,
  show_id: null,
  created_at: '2026-08-01T10:00:00.000Z',
};

function message(overrides: Partial<SupportMessage>): SupportMessage {
  return {
    id: 'm1',
    ticket_id: 'ticket-1',
    sender_id: 'owner-1',
    body: 'Hello',
    is_from_operator: false,
    created_at: '2026-08-01T10:00:00.000Z',
    ...overrides,
  };
}

describe('buildThreads', () => {
  it('groups messages under their ticket', () => {
    const threads = buildThreads(
      [TICKET],
      [message({ id: 'm1' }), message({ id: 'm2', ticket_id: 'other' })]
    );
    expect(threads).toHaveLength(1);
    expect(threads[0].messages.map(m => m.id)).toEqual(['m1']);
  });

  it('keeps a ticket with no messages, with an empty message list', () => {
    const threads = buildThreads([TICKET], []);
    expect(threads).toHaveLength(1);
    expect(threads[0].messages).toEqual([]);
  });
});

describe('needsReply', () => {
  it('is true when the last message is from the exhibitor', () => {
    expect(needsReply({ ticket: TICKET, messages: [message({})] })).toBe(true);
  });

  it('is false when the operator answered last', () => {
    const thread: TicketThread = {
      ticket: TICKET,
      messages: [
        message({ id: 'm1', created_at: '2026-08-01T10:00:00.000Z' }),
        message({
          id: 'm2',
          is_from_operator: true,
          created_at: '2026-08-01T10:05:00.000Z',
        }),
      ],
    };
    expect(needsReply(thread)).toBe(false);
  });

  it('is true when the exhibitor wrote after the operator', () => {
    const thread: TicketThread = {
      ticket: TICKET,
      messages: [
        message({ id: 'm1', created_at: '2026-08-01T10:00:00.000Z' }),
        message({ id: 'm2', is_from_operator: true, created_at: '2026-08-01T10:05:00.000Z' }),
        message({ id: 'm3', created_at: '2026-08-01T10:10:00.000Z' }),
      ],
    };
    expect(needsReply(thread)).toBe(true);
  });

  it('ignores array order and uses timestamps', () => {
    const thread: TicketThread = {
      ticket: TICKET,
      messages: [
        message({ id: 'm2', is_from_operator: true, created_at: '2026-08-01T10:05:00.000Z' }),
        message({ id: 'm1', created_at: '2026-08-01T10:00:00.000Z' }),
      ],
    };
    expect(needsReply(thread)).toBe(false);
  });

  it('is false for a thread with no messages', () => {
    expect(needsReply({ ticket: TICKET, messages: [] })).toBe(false);
  });
});

describe('sendOperatorReply', () => {
  it('inserts when the live thread still has no operator answer', async () => {
    const source = {
      openTickets: vi.fn(),
      messagesFor: vi.fn().mockResolvedValue([message({ id: 'm1' })]),
      insertOperatorMessage: vi.fn().mockResolvedValue(undefined),
      updateTicketStatus: vi.fn().mockResolvedValue(undefined),
      ownersFor: vi.fn().mockResolvedValue([]),
    };
    const result = await sendOperatorReply(
      { ticket: TICKET, messages: [message({ id: 'm1' })] },
      'Here you go.',
      'operator-1',
      source
    );
    expect(result).toBe('sent');
    expect(source.insertOperatorMessage).toHaveBeenCalledWith(
      'ticket-1',
      'operator-1',
      'Here you go.'
    );
  });

  it('skips when the live thread gained an operator answer since the pass began', async () => {
    const source = {
      openTickets: vi.fn(),
      messagesFor: vi
        .fn()
        .mockResolvedValue([
          message({ id: 'm1' }),
          message({ id: 'm2', is_from_operator: true, created_at: '2026-08-01T10:05:00.000Z' }),
        ]),
      insertOperatorMessage: vi.fn(),
      updateTicketStatus: vi.fn(),
      ownersFor: vi.fn().mockResolvedValue([]),
    };
    const result = await sendOperatorReply(
      { ticket: TICKET, messages: [message({ id: 'm1' })] },
      'Here you go.',
      'operator-1',
      source
    );
    expect(result).toBe('skipped_already_answered');
    expect(source.insertOperatorMessage).not.toHaveBeenCalled();
  });

  it('skips rather than sends when the live thread comes back empty', async () => {
    const source = {
      openTickets: vi.fn(),
      messagesFor: vi.fn().mockResolvedValue([]),
      insertOperatorMessage: vi.fn(),
      updateTicketStatus: vi.fn(),
      ownersFor: vi.fn().mockResolvedValue([]),
    };
    const result = await sendOperatorReply(
      { ticket: TICKET, messages: [message({ id: 'm1' })] },
      'Here you go.',
      'operator-1',
      source
    );
    expect(result).toBe('skipped_already_answered');
    expect(source.insertOperatorMessage).not.toHaveBeenCalled();
  });

  it('aborts when the guard rejects the freshly-read thread', async () => {
    // The exhibitor came back with a carve-out trigger while we were classifying.
    const source = {
      openTickets: vi.fn(),
      messagesFor: vi.fn().mockResolvedValue([
        message({ id: 'm1', created_at: '2026-08-01T10:00:00.000Z' }),
        message({ id: 'm2', is_from_operator: true, created_at: '2026-08-01T10:05:00.000Z' }),
        message({
          id: 'm3',
          body: 'Actually I want a refund',
          created_at: '2026-08-01T10:10:00.000Z',
        }),
      ]),
      insertOperatorMessage: vi.fn(),
      updateTicketStatus: vi.fn(),
      ownersFor: vi.fn().mockResolvedValue([]),
    };
    const result = await sendOperatorReply(
      { ticket: TICKET, messages: [message({ id: 'm1' })] },
      'Here you go.',
      'operator-1',
      source,
      () => false
    );
    expect(result).toBe('skipped_guard_rejected');
    expect(source.insertOperatorMessage).not.toHaveBeenCalled();
  });

  it('passes the freshly-read thread to the guard, not the stale copy', async () => {
    const fresh = [
      message({ id: 'm1', created_at: '2026-08-01T10:00:00.000Z' }),
      message({ id: 'm3', body: 'new reply', created_at: '2026-08-01T10:10:00.000Z' }),
    ];
    const source = {
      openTickets: vi.fn(),
      messagesFor: vi.fn().mockResolvedValue(fresh),
      insertOperatorMessage: vi.fn().mockResolvedValue(undefined),
      updateTicketStatus: vi.fn().mockResolvedValue(undefined),
      ownersFor: vi.fn().mockResolvedValue([]),
    };
    const guard = vi.fn().mockReturnValue(true);
    await sendOperatorReply(
      { ticket: TICKET, messages: [message({ id: 'm1' })] },
      'Here you go.',
      'operator-1',
      source,
      guard
    );
    expect(guard).toHaveBeenCalledTimes(1);
    expect(guard.mock.calls[0][0].messages.map((m: { id: string }) => m.id)).toEqual(['m1', 'm3']);
  });

  it('marks the ticket waiting after a successful send', async () => {
    const source = {
      openTickets: vi.fn(),
      messagesFor: vi.fn().mockResolvedValue([message({ id: 'm1' })]),
      insertOperatorMessage: vi.fn().mockResolvedValue(undefined),
      updateTicketStatus: vi.fn().mockResolvedValue(undefined),
      ownersFor: vi.fn().mockResolvedValue([]),
    };
    await sendOperatorReply(
      { ticket: TICKET, messages: [message({ id: 'm1' })] },
      'Here you go.',
      'operator-1',
      source
    );
    expect(source.updateTicketStatus).toHaveBeenCalledWith('ticket-1', 'waiting');
  });

  it('does not mark the ticket waiting when the send was skipped', async () => {
    const source = {
      openTickets: vi.fn(),
      messagesFor: vi
        .fn()
        .mockResolvedValue([
          message({ id: 'm1' }),
          message({ id: 'm2', is_from_operator: true, created_at: '2026-08-01T10:05:00.000Z' }),
        ]),
      insertOperatorMessage: vi.fn(),
      updateTicketStatus: vi.fn(),
      ownersFor: vi.fn().mockResolvedValue([]),
    };
    await sendOperatorReply(
      { ticket: TICKET, messages: [message({ id: 'm1' })] },
      'Here you go.',
      'operator-1',
      source
    );
    expect(source.updateTicketStatus).not.toHaveBeenCalled();
  });

  it('re-reads the live thread rather than trusting the in-memory copy', async () => {
    const source = {
      openTickets: vi.fn(),
      messagesFor: vi.fn().mockResolvedValue([message({ id: 'm1' })]),
      insertOperatorMessage: vi.fn().mockResolvedValue(undefined),
      updateTicketStatus: vi.fn().mockResolvedValue(undefined),
      ownersFor: vi.fn().mockResolvedValue([]),
    };
    await sendOperatorReply(
      { ticket: TICKET, messages: [message({ id: 'm1' })] },
      'Here you go.',
      'operator-1',
      source
    );
    expect(source.messagesFor).toHaveBeenCalledWith(['ticket-1']);
  });
});
