import { describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { PUBLIC_CLUB_DETAIL_QUERY_KEY } from '@/hooks/useClubDetailData';
import { refreshClubAuthorization } from './refreshClubAuthorization';

const CLUB_ID = '44444444-4444-4444-8444-444444444444';

describe('refreshClubAuthorization (MYK9-2153)', () => {
  it('refreshes the club page server read, so an authorized club leaves "awaiting"', async () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const ensureClubsReady = vi.fn().mockResolvedValue({ status: 'fresh' });

    const status = await refreshClubAuthorization({
      queryClient,
      ensureClubsReady,
      clubId: CLUB_ID,
    });

    expect(status).toBe('fresh');
    expect(ensureClubsReady).toHaveBeenCalledWith({ requestedClubId: CLUB_ID, force: true });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: [...PUBLIC_CLUB_DETAIL_QUERY_KEY, CLUB_ID],
    });
  });

  it("refreshes the admin overview counts, since authorizing closes the club's pending request", async () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    await refreshClubAuthorization({
      queryClient,
      ensureClubsReady: vi.fn().mockResolvedValue({ status: 'fresh' }),
      clubId: CLUB_ID,
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['admin', 'overview'] });
  });
});
