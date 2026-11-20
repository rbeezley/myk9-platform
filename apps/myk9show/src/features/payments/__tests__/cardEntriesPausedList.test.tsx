import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Show } from '@/types/show-types';
import type { EnhancedShow } from '@/hooks/useBrowseShowsData';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }));

import { ShowCardHorizontal } from '@/components/shows/browse/ShowCardHorizontal';
import { ShowCardVertical } from '@/components/shows/ShowCardVertical';
import { ShowsTableView } from '@/components/shows/browse/ShowsTableView';
import { CardEntriesPausedScope } from '../cardEntriesPausedContext';

function makeShow(id: string, overrides: Partial<Show> = {}): Show {
  return {
    id,
    name: `Show ${id}`,
    organization: 'AKC',
    startDate: '2099-10-20',
    endDate: '2099-10-22',
    location: 'Tulsa, OK',
    status: 'published',
    events: ['Scent Work'],
    source: 'myK9Show',
    entryOpenDate: '2000-01-01',
    entryCloseDate: '2099-10-06',
    onlineEntriesEnabled: true,
    preEntryFee: '28',
    clubId: 'club-1',
    clubName: 'Club',
    acceptCheckPayments: false,
    acceptCashPayments: false,
    trials: [],
    ...overrides,
  } as Show;
}

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('card entries paused across one list (MYK9-2192)', () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it('asks once for a list of cards, and only the paused card reads paused', async () => {
    rpc.mockResolvedValue({ data: ['a'], error: null });
    const shows = [
      makeShow('a'),
      makeShow('b'),
      makeShow('c'),
      makeShow('check', { acceptCheckPayments: true }),
    ];
    renderWithClient(
      <CardEntriesPausedScope shows={shows}>
        {shows.map(show => (
          <ShowCardHorizontal key={show.id} show={show} />
        ))}
        <ShowCardVertical show={makeShow('d')} />
      </CardEntriesPausedScope>
    );

    await waitFor(() => expect(screen.getAllByText('Entries Paused')).toHaveLength(1));
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('shows_card_entries_paused', {
      p_show_ids: ['a', 'b', 'c'],
    });
  });

  it('reads a paused show as paused in the table too', async () => {
    rpc.mockResolvedValue({ data: ['a'], error: null });
    const shows = [makeShow('a'), makeShow('b')] as EnhancedShow[];
    renderWithClient(
      <CardEntriesPausedScope shows={shows}>
        <ShowsTableView shows={shows} canManageShow={() => false} />
      </CardEntriesPausedScope>
    );
    await waitFor(() => expect(screen.getAllByText('Entries Paused')).toHaveLength(1));
    expect(screen.getAllByText('Accepting Entries').length).toBeGreaterThanOrEqual(1);
  });

  it('reads as today when the call fails', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('offline') });
    const shows = [makeShow('a')];
    renderWithClient(
      <CardEntriesPausedScope shows={shows}>
        <ShowCardHorizontal show={shows[0]!} />
      </CardEntriesPausedScope>
    );
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(screen.queryByText('Entries Paused')).not.toBeInTheDocument();
  });
});
