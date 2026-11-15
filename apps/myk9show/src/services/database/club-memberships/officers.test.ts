import { beforeEach, describe, expect, it, vi } from 'vitest';

const { from, rpc, insert } = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  insert: vi.fn(),
}));

vi.mock('../supabaseClient', () => ({ supabase: { from, rpc } }));

import { addClubOfficer, fetchShowClubOfficers, getClubOfficers } from './officers';

function mockInsertReturning(row: Record<string, unknown>) {
  insert.mockReturnValue({
    select: () => ({ single: () => Promise.resolve({ data: row, error: null }) }),
  });
  from.mockReturnValue({ insert });
}

describe('club officers service (MYK9-2045)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inserts a typed name with a null person_id and the trimmed display_name', async () => {
    mockInsertReturning({
      id: 'o-1',
      club_id: 'club-1',
      person_id: null,
      display_name: 'Sam Typed',
      position: 'secretary',
      term_start: null,
      term_end: null,
      elected_date: null,
      people: null,
    });

    const officer = await addClubOfficer({
      clubId: 'club-1',
      displayName: '  Sam Typed ',
      position: 'secretary',
    });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        club_id: 'club-1',
        person_id: null,
        display_name: 'Sam Typed',
        position: 'secretary',
      })
    );
    expect(officer.personId).toBeNull();
    expect(officer.personName).toBe('Sam Typed');
    expect(officer.position).toBe('secretary');
  });

  it('inserts a person with an account with no display_name, as before', async () => {
    mockInsertReturning({
      id: 'o-2',
      club_id: 'club-1',
      person_id: 'p-1',
      display_name: null,
      position: 'president',
      term_start: null,
      term_end: null,
      elected_date: null,
      people: { first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.com' },
    });

    const officer = await addClubOfficer({
      clubId: 'club-1',
      personId: 'p-1',
      position: 'president',
    });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ person_id: 'p-1', display_name: null })
    );
    expect(officer.personName).toBe('Ada Lovelace');
    expect(officer.personEmail).toBe('ada@example.com');
  });

  it('reads a linked person by name and a typed officer by display_name', async () => {
    from.mockReturnValue({
      select: () => ({
        eq: () =>
          Promise.resolve({
            data: [
              {
                id: 'o-1',
                club_id: 'club-1',
                person_id: 'p-1',
                display_name: null,
                position: 'president',
                term_start: null,
                term_end: null,
                elected_date: null,
                people: { first_name: 'Ada', last_name: 'Lovelace', email: null },
              },
              {
                id: 'o-2',
                club_id: 'club-1',
                person_id: null,
                display_name: 'Sam Typed',
                position: 'treasurer',
                term_start: null,
                term_end: null,
                elected_date: null,
                people: null,
              },
            ],
            error: null,
          }),
      }),
    });

    const officers = await getClubOfficers('club-1');

    expect(officers.map(o => o.personName)).toEqual(['Ada Lovelace', 'Sam Typed']);
  });

  it('reads a show club officers through get_show_club_officers, null on failure', async () => {
    rpc.mockResolvedValueOnce({
      data: [{ position: 'secretary', name: 'Sam Typed' }],
      error: null,
    });
    expect(await fetchShowClubOfficers('show-1')).toEqual([
      { position: 'secretary', name: 'Sam Typed' },
    ]);
    expect(rpc).toHaveBeenCalledWith('get_show_club_officers', { p_show_id: 'show-1' });

    rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    expect(await fetchShowClubOfficers('show-1')).toBeNull();
  });
});
