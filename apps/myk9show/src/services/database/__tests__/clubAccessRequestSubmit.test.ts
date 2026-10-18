import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('../supabaseClient', () => ({ supabase: { rpc: mocks.rpc } }));

import { submitNewClubAccessRequest } from '../club-access-requests';

// PostgREST picks a submit_club_access_request overload by the set of keys in the
// body. The 3-arg form only raises "Enter at least one club number", so a key that
// JSON.stringify drops (undefined instead of null) would silently break every new-club
// request (MYK9-1235). Pin all four keys, blanks included, on the wire.
describe('submitNewClubAccessRequest payload', () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.rpc.mockResolvedValue({ data: 'request-1', error: null });
  });

  it('sends all four keys, with null for a blank website and note', async () => {
    await submitNewClubAccessRequest({
      clubName: 'Riverbend Scent Club',
      website: '',
      note: '',
      clubNumbers: { AKC: ' 4521 ' },
    });

    expect(mocks.rpc).toHaveBeenCalledWith('submit_club_access_request', {
      p_requested_club_name: 'Riverbend Scent Club',
      p_requested_club_website: null,
      p_request_note: null,
      p_club_numbers: { AKC: '4521' },
    });
    const body = JSON.parse(JSON.stringify(mocks.rpc.mock.calls[0][1])) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual([
      'p_club_numbers',
      'p_request_note',
      'p_requested_club_name',
      'p_requested_club_website',
    ]);
  });
});
