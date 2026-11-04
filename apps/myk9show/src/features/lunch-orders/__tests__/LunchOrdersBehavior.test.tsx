import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { queryKeys } from '@/lib/queryClient';
import { ShowDeskToolPanel } from '@/features/show-map/ShowDeskToolsSheet';
import { LunchOrderRow } from '../LunchOrderRow';
import { LunchOrdersTool } from '../LunchOrdersTool';
import type { LunchListItem } from '../lunchOrders';
import { useTrialLunchOrders } from '../useLunchOrders';

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  list: vi.fn(),
  remove: vi.fn(),
  judges: { data: [] as unknown[], isLoading: false, isError: false, refetch: vi.fn() },
  officials: { data: undefined as unknown, isLoading: false, isError: false, refetch: vi.fn() },
  volunteers: { data: [] as unknown[], isLoading: false, isError: false, refetch: vi.fn() },
}));

vi.mock('../lunchOrdersService', () => ({
  lunchOrdersService: { listForTrial: mocks.list, save: mocks.save, remove: mocks.remove },
}));
vi.mock('@/features/judge-supplies/useTrialJudges', () => ({ useTrialJudges: () => mocks.judges }));
vi.mock('@/hooks/queries/useShowOfficials', () => ({ useShowOfficials: () => mocks.officials }));
vi.mock('../useLunchOrders', async importOriginal => ({
  ...(await importOriginal<typeof import('../useLunchOrders')>()),
  useVolunteersOnDays: () => mocks.volunteers,
}));

const item: LunchListItem = {
  key: 'p:1',
  savedId: 'row-1',
  personId: 'p-1',
  name: 'Jo Judge',
  role: 'judge',
  lunchOrder: 'Wrap',
  dietaryNote: '',
  assigned: true,
};

describe('LunchOrderRow edits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.save.mockResolvedValue(undefined);
    mocks.list.mockResolvedValue([]);
    mocks.judges = { data: [], isLoading: false, isError: false, refetch: vi.fn() };
    mocks.officials = { data: undefined, isLoading: false, isError: false, refetch: vi.fn() };
    mocks.volunteers = { data: [], isLoading: false, isError: false, refetch: vi.fn() };
  });

  it('follows a newer server value on an untouched field and saves only the field typed', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <ul>
        <LunchOrderRow item={item} trialId="trial-1" />
      </ul>
    );

    // Another device saved a dietary note and a new lunch order while this row sat untouched.
    rerender(
      <ul>
        <LunchOrderRow
          item={{ ...item, lunchOrder: 'Salad', dietaryNote: 'No dairy' }}
          trialId="trial-1"
        />
      </ul>
    );
    expect(screen.getByLabelText('Dietary note for Jo Judge')).toHaveValue('No dairy');
    expect(screen.getByLabelText('Lunch order for Jo Judge')).toHaveValue('Salad');

    await user.type(screen.getByLabelText('Lunch order for Jo Judge'), '!');
    await user.tab();

    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect(mocks.save).toHaveBeenCalledWith({
      trialId: 'trial-1',
      savedId: 'row-1',
      personId: 'p-1',
      name: 'Jo Judge',
      role: 'judge',
      lunchOrder: 'Salad!',
    });
  });

  it('keeps text being typed when a refetch brings a different server value', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <ul>
        <LunchOrderRow item={item} trialId="trial-1" />
      </ul>
    );

    await user.type(screen.getByLabelText('Lunch order for Jo Judge'), 'X');
    rerender(
      <ul>
        <LunchOrderRow item={{ ...item, lunchOrder: 'Soup' }} trialId="trial-1" />
      </ul>
    );

    expect(screen.getByLabelText('Lunch order for Jo Judge')).toHaveValue('WrapX');
  });

  it('saves an unsaved edit when the Show Desk panel is closed with Escape', async () => {
    mocks.judges = {
      data: [{ person_id: 'p-judge', judge_name: 'Jo Judge' }],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    };
    const user = userEvent.setup();
    render(
      <ShowDeskToolPanel
        tools={[
          {
            id: 'lunch-orders',
            group: 'show-logistics',
            title: 'Lunch orders',
            summary: 'Plan lunch',
            content: <LunchOrdersTool showId="show-1" trials={[{ id: 'trial-1', name: 'Sat' }]} />,
          } as never,
        ]}
      />,
      { initialRoute: '/shows/show-1?tool=lunch-orders' }
    );

    await user.type(await screen.findByLabelText('Lunch order for Jo Judge'), 'Wrap');
    expect(mocks.save).not.toHaveBeenCalled();

    // Escape closes the sheet; the field never blurs, so the unmount flush must save it.
    await user.keyboard('{Escape}');

    await waitFor(() =>
      expect(mocks.save).toHaveBeenCalledWith({
        trialId: 'trial-1',
        savedId: null,
        personId: 'p-judge',
        name: 'Jo Judge',
        role: 'judge',
        lunchOrder: 'Wrap',
      })
    );
  });

  it('shows a removal failure in the row with a retry', async () => {
    const onRemove = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <ul>
        <LunchOrderRow item={{ ...item, assigned: false }} trialId="trial-1" onRemove={onRemove} />
      </ul>
    );

    await user.click(screen.getByRole('button', { name: 'Remove Jo Judge' }));
    expect(await screen.findByText(/Could not remove Jo Judge/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRemove).toHaveBeenCalledTimes(2);
  });
});

describe('roster failures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.list.mockResolvedValue([]);
  });

  it('says some people could not be loaded and retries the failed reads', async () => {
    mocks.judges = { data: [], isLoading: false, isError: true, refetch: vi.fn() };
    mocks.officials = { data: undefined, isLoading: false, isError: false, refetch: vi.fn() };
    mocks.volunteers = { data: [], isLoading: false, isError: true, refetch: vi.fn() };
    const user = userEvent.setup();
    render(<LunchOrdersTool showId="show-1" trials={[{ id: 'trial-1', name: 'Sat' }]} />);

    expect(await screen.findByText(/Some people could not be loaded/)).toBeInTheDocument();
    expect(screen.queryByText(/No one is assigned/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mocks.judges.refetch).toHaveBeenCalled();
    expect(mocks.volunteers.refetch).toHaveBeenCalled();
    expect(mocks.officials.refetch).not.toHaveBeenCalled();
  });
});

describe('query keys and redaction', () => {
  it('marks the save and remove mutations sensitive so names stay out of the error log', async () => {
    const queryClient = new QueryClient();
    const { result } = renderHook(() => useTrialLunchOrders('trial-1'), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    });
    mocks.save.mockResolvedValue(undefined);
    await result.current.save.mutateAsync({
      savedId: null,
      personId: null,
      name: 'Ann',
      role: 'other',
    });
    await waitFor(() => expect(queryClient.getMutationCache().getAll().length).toBe(1));
    expect(queryClient.getMutationCache().getAll()[0]?.options.meta).toEqual({
      sensitiveVariables: true,
    });
  });

  it('is refreshed by the existing volunteer assignment invalidations', async () => {
    const queryClient = new QueryClient();
    const general = queryKeys.lunchVolunteersGeneral('show-1', ['t-2', 't-1']);
    const byClass = queryKeys.lunchVolunteersByClass('show-1');
    queryClient.setQueryData(general, []);
    queryClient.setQueryData(byClass, []);

    // These are the keys useAssignToGeneralDuty / useAssignToClass invalidate.
    await queryClient.invalidateQueries({
      queryKey: queryKeys.volunteerGeneralAssignments('show-1'),
    });
    await queryClient.invalidateQueries({
      queryKey: queryKeys.volunteerClassAssignments('show-1'),
    });

    expect(queryClient.getQueryState(general)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(byClass)?.isInvalidated).toBe(true);
  });
});
