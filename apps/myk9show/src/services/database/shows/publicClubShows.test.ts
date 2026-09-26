import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '../supabaseClient';
import { getPublicClubShows } from './publicClubShows';

const query = vi.hoisted(() => ({
  select: vi.fn(),
  eq: vi.fn(),
  in: vi.fn(),
  is: vi.fn(),
  order: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.in.mockReturnValue(query);
  query.is.mockReturnValue(query);
  vi.mocked(supabase.from).mockReturnValue(query as never);
});

describe('getPublicClubShows (MYK9-768)', () => {
  it("reads the club's shows with named columns and anon shows_select's own filters", async () => {
    query.order.mockResolvedValue({ data: [], error: null });

    await getPublicClubShows('club-1');

    expect(supabase.from).toHaveBeenCalledWith('shows');
    expect(query.select).toHaveBeenCalledWith(
      'id, name, organization, start_date, end_date, location, accent_color, trials(trial_type)'
    );
    expect(query.eq).toHaveBeenCalledWith('club_id', 'club-1');
    // shows_select (20260823190000) for anon: these statuses, never deleted.
    expect(query.in).toHaveBeenCalledWith('status', [
      'published',
      'upcoming',
      'in_progress',
      'completed',
    ]);
    expect(query.is).toHaveBeenCalledWith('deleted_at', null);
  });

  it('maps rows onto the club list shape, events from distinct trial types', async () => {
    query.order.mockResolvedValue({
      data: [
        {
          id: 'show-1',
          name: 'Spring Trial',
          organization: 'AKC',
          start_date: '2099-05-01',
          end_date: '2099-05-02',
          location: null,
          accent_color: '#123456',
          trials: [{ trial_type: 'Scent Work' }, { trial_type: 'Scent Work' }],
        },
        {
          id: 'show-2',
          name: 'Fall Trial',
          organization: 'UKC',
          start_date: '2099-09-01',
          end_date: '2099-09-01',
          location: 'Tulsa, OK',
          accent_color: null,
          trials: [],
        },
      ],
      error: null,
    });

    await expect(getPublicClubShows('club-1')).resolves.toEqual([
      {
        id: 'show-1',
        name: 'Spring Trial',
        startDate: '2099-05-01',
        endDate: '2099-05-02',
        location: '',
        events: ['Scent Work'],
        accentColor: '#123456',
      },
      {
        id: 'show-2',
        name: 'Fall Trial',
        startDate: '2099-09-01',
        endDate: '2099-09-01',
        location: 'Tulsa, OK',
        events: ['UKC'],
        accentColor: null,
      },
    ]);
  });

  it('throws on a failed read so it never reads as "no shows"', async () => {
    query.order.mockResolvedValue({ data: null, error: { message: 'boom', code: '500' } });

    await expect(getPublicClubShows('club-1')).rejects.toBeTruthy();
  });
});
