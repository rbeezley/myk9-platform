import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { onlineManager } from '@tanstack/react-query';
import { fromAny } from '@total-typescript/shoehorn';
import { searchUsers } from '@/services/database/users';
import { fetchServerPersonMatches, LOOKUP_DEADLINE_MS } from './useServerPersonMatches';

vi.mock('@/services/database/users', () => ({ searchUsers: vi.fn() }));

const searchUsersMock = vi.mocked(searchUsers);

const ROW = {
  id: 'person-server-1',
  first_name: 'Molly',
  last_name: 'Mailbox',
  email: 'molly.mailbox@example.com',
};
const IDENTITY = { firstName: 'Molly', lastName: 'Mailbox', email: 'molly.mailbox@example.com' };

const answer = (data: unknown[]) => Promise.resolve(fromAny({ data, error: null }));
const never = () => new Promise<never>(() => {});

describe('fetchServerPersonMatches deadline (MYK9-2257)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    onlineManager.setOnline(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps the last-name match when the email search never settles', async () => {
    searchUsersMock.mockImplementation(term => (term === 'Mailbox' ? answer([ROW]) : never()));
    const pending = fetchServerPersonMatches(IDENTITY);
    await vi.advanceTimersByTimeAsync(LOOKUP_DEADLINE_MS + 1);
    const result = await pending;
    expect(result.failed).toBe(false);
    expect(result.people.map(person => person.id)).toEqual(['person-server-1']);
  });

  it('keeps the email match when the last-name search never settles', async () => {
    searchUsersMock.mockImplementation(term => (term === 'Mailbox' ? never() : answer([ROW])));
    const pending = fetchServerPersonMatches(IDENTITY);
    await vi.advanceTimersByTimeAsync(LOOKUP_DEADLINE_MS + 1);
    const result = await pending;
    expect(result.failed).toBe(false);
    expect(result.people.map(person => person.id)).toEqual(['person-server-1']);
  });

  it('fails only when no term answered in time', async () => {
    searchUsersMock.mockImplementation(() => never());
    const pending = fetchServerPersonMatches(IDENTITY);
    await vi.advanceTimersByTimeAsync(LOOKUP_DEADLINE_MS + 1);
    expect(await pending).toEqual({ people: [], failed: true });
  });
});
