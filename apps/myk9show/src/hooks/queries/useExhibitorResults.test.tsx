import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import { useTitleProgress } from '@/hooks/useTitleProgress';
import { useExhibitorResults } from './useExhibitorResults';

const mocks = vi.hoisted(() => ({
  filter: vi.fn(),
  range: vi.fn(),
  dogs: [{ id: 'dog-a' }, { id: 'dog-b' }],
}));
vi.mock('./useDogsDatabase', () => ({ useDogsQuery: () => ({ data: mocks.dogs }) }));
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: () => {
      const query = {
        select: () => query,
        in: (column: string, ids: string[]) => {
          mocks.filter(column, ids);
          return query;
        },
        eq: () => query,
        order: () => query,
        range: mocks.range,
      };
      return query;
    },
  },
}));
vi.mock('./useManualResultsDatabase', () => ({
  useQualifyingManualResultsQuery: () => ({ data: [], isLoading: false }),
}));
vi.mock('./useSportTemplates', () => ({
  useSportTemplatesQuery: () => ({ data: [], isLoading: false }),
  useAllSportTitlesQuery: () => ({ data: [], isLoading: false }),
}));

function Titles({ dogId = 'dog-a' }: { dogId?: string }) {
  const { isLoading } = useTitleProgress(dogId);
  return <p>{isLoading ? 'loading' : 'ready'}</p>;
}
function Results() {
  const { data, isError } = useExhibitorResults();
  return <p>{isError ? 'error' : data ? `results: ${data.length}` : 'loading'}</p>;
}

beforeEach(() => {
  mocks.filter.mockClear();
  mocks.range.mockReset().mockResolvedValue({ data: [], error: null });
});

describe('exhibitor scored-result query scope', () => {
  it('requests only the title card dog instead of every owned dog (MYK9-289)', async () => {
    render(<Titles />);
    await screen.findByText('ready');
    expect(mocks.filter).toHaveBeenCalledWith('dog_id', ['dog-a']);
  });

  it('preserves all-dog results for the results page and fetches every page', async () => {
    mocks.range
      .mockResolvedValueOnce({
        data: Array.from({ length: 1000 }, (_, i) => ({ id: `entry-${i}`, dog_id: 'dog-a' })),
        error: null,
      })
      .mockResolvedValueOnce({ data: [{ id: 'last', dog_id: 'dog-b' }], error: null });
    render(<Results />);
    await screen.findByText('results: 1001');
    expect(mocks.filter).toHaveBeenCalledWith('dog_id', ['dog-a', 'dog-b']);
    expect(mocks.range.mock.calls).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it('keeps separate cache entries for different dogs', async () => {
    render(
      <>
        <Titles />
        <Titles dogId="dog-b" />
      </>
    );
    await waitFor(() => expect(screen.getAllByText('ready')).toHaveLength(2));
    expect(mocks.filter.mock.calls).toEqual([
      ['dog_id', ['dog-a']],
      ['dog_id', ['dog-b']],
    ]);
  });

  it('does not widen result access to a dog outside the existing dog list', async () => {
    render(<Titles dogId="other-dog" />);
    await screen.findByText('ready');
    expect(mocks.filter).not.toHaveBeenCalled();
  });

  it('loads the full history for a selected dog with more than 1000 results', async () => {
    mocks.range.mockResolvedValueOnce({
      data: Array.from({ length: 1000 }, (_, i) => ({ id: `entry-${i}`, dog_id: 'dog-a' })),
      error: null,
    });
    render(<Titles />);
    await screen.findByText('ready');
    expect(mocks.range.mock.calls).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
    expect(mocks.filter.mock.calls).toEqual([
      ['dog_id', ['dog-a']],
      ['dog_id', ['dog-a']],
    ]);
  });

  it('surfaces failures instead of returning a partial history', async () => {
    mocks.range.mockResolvedValue({ data: null, error: new Error('unavailable') });
    render(<Results />);
    await waitFor(() => expect(screen.getByText('error')).toBeInTheDocument());
  });
});
