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

function fakeSource(live: SupportMessage[], sent = true) {
  return {
    openTickets: vi.fn(),
    messagesFor: vi.fn().mockResolvedValue(live),
    sendOperatorReplyAtomic: vi.fn().mockResolvedValue(sent),
    ownersFor: vi.fn().mockResolvedValue([]),
  };
}

describe('sendOperatorReply', () => {
  it('sends when the live thread still has no operator answer', async () => {
    const source = fakeSource([message({ id: 'm1' })]);
    const result = await sendOperatorReply(
      { ticket: TICKET, messages: [message({ id: 'm1' })] },
      'Here you go.',
      'operator-1',
      source
    );
    expect(result).toBe('sent');
    expect(source.sendOperatorReplyAtomic).toHaveBeenCalledWith(
      'ticket-1',
      'operator-1',
      'Here you go.',
      'm1'
    );
  });

  // The id is the whole point of the database guard: it names the message this
  // reply answers, so an insert that arrives after our read is rejected server
  // side. Passing a stale or wrong id silently reopens MYK9-135.
  it('gates on the newest LIVE message id, not the id from the stale copy', async () => {
    const source = fakeSource([
      message({ id: 'm1', created_at: '2026-08-01T10:00:00.000Z' }),
      message({ id: 'm3', body: 'one more thing', created_at: '2026-08-01T10:10:00.000Z' }),
    ]);
    await sendOperatorReply(
      { ticket: TICKET, messages: [message({ id: 'm1' })] },
      'Here you go.',
      'operator-1',
      source
    );
    expect(source.sendOperatorReplyAtomic).toHaveBeenCalledWith(
      'ticket-1',
      'operator-1',
      'Here you go.',
      'm3'
    );
  });

  it('reports skipped when the database refused the insert', async () => {
    // A human operator answered between our read and the RPC; the conditional
    // insert matched no row.
    const source = fakeSource([message({ id: 'm1' })], false);
    const result = await sendOperatorReply(
      { ticket: TICKET, messages: [message({ id: 'm1' })] },
      'Here you go.',
      'operator-1',
      source
    );
    expect(result).toBe('skipped_already_answered');
  });

  it('skips when the live thread gained an operator answer since the pass began', async () => {
    const source = fakeSource([
      message({ id: 'm1' }),
      message({ id: 'm2', is_from_operator: true, created_at: '2026-08-01T10:05:00.000Z' }),
    ]);
    const result = await sendOperatorReply(
      { ticket: TICKET, messages: [message({ id: 'm1' })] },
      'Here you go.',
      'operator-1',
      source
    );
    expect(result).toBe('skipped_already_answered');
    expect(source.sendOperatorReplyAtomic).not.toHaveBeenCalled();
  });

  it('skips rather than sends when the live thread comes back empty', async () => {
    const source = fakeSource([]);
    const result = await sendOperatorReply(
      { ticket: TICKET, messages: [message({ id: 'm1' })] },
      'Here you go.',
      'operator-1',
      source
    );
    expect(result).toBe('skipped_already_answered');
    expect(source.sendOperatorReplyAtomic).not.toHaveBeenCalled();
  });

  it('aborts when the guard rejects the freshly-read thread', async () => {
    // The exhibitor came back with a carve-out trigger while we were classifying.
    const source = fakeSource([
      message({ id: 'm1', created_at: '2026-08-01T10:00:00.000Z' }),
      message({ id: 'm2', is_from_operator: true, created_at: '2026-08-01T10:05:00.000Z' }),
      message({
        id: 'm3',
        body: 'Actually I want a refund',
        created_at: '2026-08-01T10:10:00.000Z',
      }),
    ]);
    const result = await sendOperatorReply(
      { ticket: TICKET, messages: [message({ id: 'm1' })] },
      'Here you go.',
      'operator-1',
      source,
      () => false
    );
    expect(result).toBe('skipped_guard_rejected');
    expect(source.sendOperatorReplyAtomic).not.toHaveBeenCalled();
  });

  it('passes the freshly-read thread to the guard, not the stale copy', async () => {
    const source = fakeSource([
      message({ id: 'm1', created_at: '2026-08-01T10:00:00.000Z' }),
      message({ id: 'm3', body: 'new reply', created_at: '2026-08-01T10:10:00.000Z' }),
    ]);
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

  it('re-reads the live thread rather than trusting the in-memory copy', async () => {
    const source = fakeSource([message({ id: 'm1' })]);
    await sendOperatorReply(
      { ticket: TICKET, messages: [message({ id: 'm1' })] },
      'Here you go.',
      'operator-1',
      source
    );
    expect(source.messagesFor).toHaveBeenCalledWith(['ticket-1']);
  });
});
