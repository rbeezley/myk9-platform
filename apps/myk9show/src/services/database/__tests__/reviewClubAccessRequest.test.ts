import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('../supabaseClient', () => ({ supabase: { rpc: mocks.rpc } }));

import { reviewClubAccessRequest } from '../club-access-requests';

// MYK9-2513: the decline may also delete the club. The flag rides as p_delete_club and
// is left off every other call, so a decline without it is the call the server already knew.
describe('reviewClubAccessRequest', () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.rpc.mockResolvedValue({ data: null, error: null });
  });

  it('sends p_delete_club with a decline that also deletes the club', async () => {
    await reviewClubAccessRequest({
      requestId: 'request-1',
      decision: 'denied',
      reviewNote: 'Duplicate',
      deleteClub: true,
    });

    expect(mocks.rpc).toHaveBeenCalledWith('review_club_access_request', {
      p_request_id: 'request-1',
      p_decision: 'denied',
      p_existing_club_id: null,
      p_club_name: null,
      p_review_note: 'Duplicate',
      p_delete_club: true,
    });
  });

  it('leaves p_delete_club off a plain decline and off an approval', async () => {
    await reviewClubAccessRequest({ requestId: 'request-1', decision: 'denied' });
    await reviewClubAccessRequest({
      requestId: 'request-2',
      decision: 'approved',
      deleteClub: false,
    });

    for (const call of mocks.rpc.mock.calls) {
      expect(call[1]).not.toHaveProperty('p_delete_club');
    }
  });

  it('returns the club id the server approved', async () => {
    mocks.rpc.mockResolvedValue({ data: 'club-9', error: null });

    await expect(
      reviewClubAccessRequest({ requestId: 'request-3', decision: 'approved' })
    ).resolves.toBe('club-9');
  });
});
