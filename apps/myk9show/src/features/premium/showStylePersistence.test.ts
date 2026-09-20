import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Show } from '@/types/show-types';
import { showQueryKeys } from '@/hooks/queries/useShowsDatabase';
import { saveShowDraftStyle } from './showStylePersistence';

const updateShowStyleMock = vi.hoisted(() => vi.fn());

vi.mock('@/services/replication', () => ({
  replicatedShowsTable: {
    updateShowStyle: updateShowStyleMock,
  },
}));

const show: Show = {
  id: 'show-1',
  name: 'Bluegrass Classic',
  organization: 'AKC',
  startDate: '2026-03-22',
  endDate: '2026-03-23',
  location: 'Louisville, KY',
  status: 'upcoming',
  events: ['Agility'],
  source: 'myK9Show',
  entryOpenDate: '2026-01-01',
  entryCloseDate: '2026-12-31',
  preEntryFee: '25',
  clubId: 'club-1',
  clubName: 'Bluegrass KC',
  clubAddress: '123 Main Street',
  clubEmail: 'club@example.com',
  logoUrl: '',
  coverImageUrl: '',
  accentColor: '#0d4d4f',
  assignedJudges: [],
  stats: [],
  trials: [],
  acceptCheckPayments: true,
  allowNonOwnerHandlers: false,
  style: 'monogram',
};

const otherShow: Show = { ...show, id: 'show-2', name: 'Other Show', style: 'poster' };
const statistics = { total: 2, byStatus: { upcoming: 1, published: 1 } };

function seedShowCaches(queryClient: QueryClient): void {
  queryClient.setQueryData(showQueryKeys.detail('show-1'), show);
  queryClient.setQueryData(showQueryKeys.lists(), [show, otherShow]);
  queryClient.setQueryData(showQueryKeys.list({ status: 'upcoming' }), [show, otherShow]);
  queryClient.setQueryData(showQueryKeys.search('bluegrass'), [show, otherShow]);
  queryClient.setQueryData(showQueryKeys.byClub('club-1'), [show, otherShow]);
  queryClient.setQueryData(showQueryKeys.byStatus('upcoming'), [show, otherShow]);
  queryClient.setQueryData(showQueryKeys.upcoming(), [show, otherShow]);
  queryClient.setQueryData(showQueryKeys.byDateRange('2026-01-01', '2026-12-31'), [
    show,
    otherShow,
  ]);
  queryClient.setQueryData(showQueryKeys.withEntryCounts(), [show, otherShow]);
  queryClient.setQueryData(showQueryKeys.deleted(), [show, otherShow]);
  queryClient.setQueryData(showQueryKeys.statistics(), statistics);
}

describe('saveShowDraftStyle', () => {
  beforeEach(() => {
    updateShowStyleMock.mockReset();
    updateShowStyleMock.mockResolvedValue('mutation-1');
  });

  it('updates only the matching show style and sync metadata in every existing show cache', async () => {
    const queryClient = new QueryClient();
    seedShowCaches(queryClient);
    const unseededKey = showQueryKeys.search('unseeded');
    const before = queryClient.getQueryData(showQueryKeys.statistics());

    const result = await saveShowDraftStyle({ show, style: 'heritage', queryClient });

    expect(updateShowStyleMock).toHaveBeenCalledWith('show-1', 'heritage');
    expect(result).toMatchObject({
      id: 'show-1',
      style: 'heritage',
      status: 'upcoming',
      acceptCheckPayments: true,
      allowNonOwnerHandlers: false,
    });
    expect(queryClient.getQueryData(showQueryKeys.detail('show-1'))).toMatchObject({
      id: 'show-1',
      style: 'heritage',
      _syncStatus: 'pending',
      _lastModified: expect.any(Date),
    });

    for (const key of [
      showQueryKeys.lists(),
      showQueryKeys.list({ status: 'upcoming' }),
      showQueryKeys.search('bluegrass'),
      showQueryKeys.byClub('club-1'),
      showQueryKeys.byStatus('upcoming'),
      showQueryKeys.upcoming(),
      showQueryKeys.byDateRange('2026-01-01', '2026-12-31'),
      showQueryKeys.withEntryCounts(),
      showQueryKeys.deleted(),
    ]) {
      expect(queryClient.getQueryData<Show[]>(key)).toEqual([
        expect.objectContaining({ id: 'show-1', style: 'heritage', _syncStatus: 'pending' }),
        otherShow,
      ]);
    }

    expect(queryClient.getQueryData(showQueryKeys.statistics())).toBe(before);
    expect(queryClient.getQueryData(unseededKey)).toBeUndefined();
  });

  it('leaves every cache unchanged when the queued style update fails', async () => {
    const queryClient = new QueryClient();
    seedShowCaches(queryClient);
    const before = queryClient
      .getQueryCache()
      .getAll()
      .map(query => [query.queryKey, query.state.data] as const);
    updateShowStyleMock.mockRejectedValue(new Error('queue failed'));

    await expect(saveShowDraftStyle({ show, style: 'heritage', queryClient })).rejects.toThrow(
      'queue failed'
    );

    for (const [key, data] of before) {
      expect(queryClient.getQueryData(key)).toBe(data);
    }
  });
});
