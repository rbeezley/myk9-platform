import { buildTicketSubject } from './supportTickets';

describe('support tickets', () => {
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
});
