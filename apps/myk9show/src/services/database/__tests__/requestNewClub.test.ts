import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('../supabaseClient', () => ({ supabase: { rpc: mocks.rpc } }));

import { ClubNameTakenError, requestNewClub } from '../club-access-requests.request';

// MYK9-2046: the form's one server call. The RPC name and every key are what the
// database function reads, so they are pinned on the wire, blanks as null.
describe('requestNewClub', () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.rpc.mockResolvedValue({
      data: { club_id: 'club-1', request_id: 'request-1', already_requested: false },
      error: null,
    });
  });

  it('calls request_new_club with trimmed club numbers and null for blanks', async () => {
    const result = await requestNewClub({
      clubName: 'Riverbend Scent Club',
      clubNumbers: { AKC: ' 4521 ', UKC: '  ' },
    });

    expect(mocks.rpc).toHaveBeenCalledWith('request_new_club', {
      p_club_name: 'Riverbend Scent Club',
      p_club_numbers: { AKC: '4521' },
      p_request_note: null,
      p_club_website: null,
    });
    expect(result).toEqual({ clubId: 'club-1', requestId: 'request-1', alreadyRequested: false });
  });

  it('sends the note when there is one', async () => {
    await requestNewClub({
      clubName: 'Riverbend Scent Club',
      clubNumbers: { AKC: '1' },
      note: 'Organization: AKC',
    });
    expect(mocks.rpc).toHaveBeenCalledWith(
      'request_new_club',
      expect.objectContaining({ p_request_note: 'Organization: AKC' })
    );
  });

  it('turns the taken-name refusal into ClubNameTakenError', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'club_name_taken' },
    });
    await expect(
      requestNewClub({ clubName: 'Taken', clubNumbers: { AKC: '1' } })
    ).rejects.toBeInstanceOf(ClubNameTakenError);
  });

  it('rethrows any other error unchanged', async () => {
    const failure = { code: '53400', message: 'Too many pending club requests' };
    mocks.rpc.mockResolvedValue({ data: null, error: failure });
    await expect(requestNewClub({ clubName: 'X Club', clubNumbers: { AKC: '1' } })).rejects.toBe(
      failure
    );
  });
});
