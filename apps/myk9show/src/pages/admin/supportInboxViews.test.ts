import { describe, expect, it } from 'vitest';
import type { SupportTicket } from '@/features/support/supportTickets';
import { buildSupportViews, filterTickets } from './supportInboxViews';

function ticket(id: string, status: SupportTicket['status'], mockTest = false): SupportTicket {
  return {
    id,
    ownerId: 'owner',
    subject: id,
    status,
    isShowDayPriority: false,
    showId: null,
    createdAt: '',
    updatedAt: '',
    diagnostics: (mockTest
      ? { kind: 'mock-test', mockTest: { part: 'task', number: 3 } }
      : {}) as SupportTicket['diagnostics'],
  };
}

describe('support inbox mock-test view (MYK9-2022)', () => {
  const tickets = [ticket('a', 'open', true), ticket('b', 'resolved', true), ticket('c', 'open')];

  it('lists mock-test tickets in any status, and only those', () => {
    expect(filterTickets(tickets, 'mock-test').map(item => item.id)).toEqual(['a', 'b']);
  });

  it('leaves the status views alone', () => {
    expect(filterTickets(tickets, 'open').map(item => item.id)).toEqual(['a', 'c']);
  });

  it('counts the mock-test view', () => {
    const view = buildSupportViews(tickets).find(item => item.id === 'mock-test');
    expect(view).toMatchObject({ label: 'Mock test', count: 2 });
  });
});
