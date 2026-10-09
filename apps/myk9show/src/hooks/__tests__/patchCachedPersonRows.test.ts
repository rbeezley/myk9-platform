import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { patchCachedPersonRows } from '@/hooks/patchCachedPersonRows';

describe('patchCachedPersonRows (MYK9-1071)', () => {
  it('patches the edited person in each cached casing and leaves everyone else alone', () => {
    const client = new QueryClient();
    client.setQueryData(
      ['users'],
      [
        { id: 'p1', firstName: 'Pat', lastName: 'Owner', name: 'Pat Owner', streetAddress: '1 A' },
        { id: 'p2', firstName: 'Sam', lastName: 'Other', name: 'Sam Other' },
      ]
    );
    client.setQueryData(['users', 'detail', 'p1'], {
      id: 'p1',
      first_name: 'Pat',
      street_address: '1 A',
      judge_qualifications: [{ id: 'q1' }],
    });

    patchCachedPersonRows(client, 'p1', { first_name: 'Patricia', street_address: '2 B' });

    expect(client.getQueryData(['users'])).toEqual([
      {
        id: 'p1',
        firstName: 'Patricia',
        lastName: 'Owner',
        name: 'Patricia Owner',
        streetAddress: '2 B',
      },
      { id: 'p2', firstName: 'Sam', lastName: 'Other', name: 'Sam Other' },
    ]);
    expect(client.getQueryData(['users', 'detail', 'p1'])).toEqual({
      id: 'p1',
      first_name: 'Patricia',
      street_address: '2 B',
      judge_qualifications: [{ id: 'q1' }],
    });
  });

  it('patches private details only into the own-profile cache (P2)', () => {
    const client = new QueryClient();
    client.setQueryData(['users', 'currentProfile', 'auth-1'], {
      id: 'p1',
      firstName: 'Pat',
      privateDetailsLoaded: true,
      dateOfBirth: '1990-01-01',
      juniorHandlerNumbers: { AKC: 'J1', UKC: 'U1' },
    });
    client.setQueryData(['users'], [{ id: 'p1', firstName: 'Pat' }]);

    patchCachedPersonRows(
      client,
      'p1',
      { first_name: 'Patricia' },
      { date_of_birth: '2000-02-02', junior_handler_numbers: { AKC: 'J2', UKC: '' } }
    );

    expect(client.getQueryData(['users', 'currentProfile', 'auth-1'])).toEqual({
      id: 'p1',
      firstName: 'Patricia',
      privateDetailsLoaded: true,
      dateOfBirth: '2000-02-02',
      juniorHandlerNumbers: { AKC: 'J2' },
    });
    expect(client.getQueryData(['users'])).toEqual([{ id: 'p1', firstName: 'Patricia' }]);
  });
});
