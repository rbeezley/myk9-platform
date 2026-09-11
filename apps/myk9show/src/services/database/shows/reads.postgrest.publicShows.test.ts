import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockSelect, mockFrom } = vi.hoisted(() => {
  const mockSelect = vi.fn();
  const mockFrom = vi.fn();
  return { mockSelect, mockFrom };
});

vi.mock('../supabaseClient', () => ({
  supabase: { from: mockFrom },
  createDatabaseError: (e: unknown) => e,
}));

import { postgrestGetPublicShows } from './reads.postgrest';
import { mapDatabaseToShow } from '@/services/mappers/showMappers';

/**
 * Guests do not have a replication store, so `useBrowseShowsData` serves the
 * /shows list from `postgrestGetPublicShows` instead. That query originally
 * selected `*, club:clubs(...)` and embedded no trials at all, so
 * `mapDatabaseToShow` saw `trials: []`, fell back to `[organization]` for
 * `show.events`, and every discipline filter on /shows returned zero results
 * for every signed-out visitor. The embed is load-bearing for that filter.
 */
describe('postgrestGetPublicShows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const chain = {
      select: mockSelect,
      in: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    mockSelect.mockReturnValue(chain);
    mockFrom.mockReturnValue(chain);
  });

  it('embeds trials so the discipline filter has a source', async () => {
    await postgrestGetPublicShows();

    const select = mockSelect.mock.calls[0]?.[0] as string;
    expect(select).toMatch(/trials\s*\(/);
    expect(select).toContain('trial_type');
  });

  it('produces a discipline-bearing events array end to end', async () => {
    const chain = {
      select: mockSelect,
      in: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: [
          {
            id: 'show-1',
            name: 'Heartland',
            organization: 'AKC',
            start_date: '2026-10-24',
            end_date: '2026-10-25',
            trials: [{ id: 't1', trial_type: 'scent_work' }],
          },
        ],
        error: null,
      }),
    };
    mockSelect.mockReturnValue(chain);
    mockFrom.mockReturnValue(chain);

    const { data } = await postgrestGetPublicShows();
    const show = mapDatabaseToShow(data[0] as Parameters<typeof mapDatabaseToShow>[0]);

    expect(show.events).toEqual(['scent_work']);
    expect(show.events).not.toEqual(['AKC']);
  });
});
