import { act, screen, waitFor } from '@testing-library/react';
import { onlineManager } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestQueryClient, render } from '@/test/utils/testUtils';

const byTrial = new Map([
  ['t1', [{ person_id: 'j1', judge_name: 'Jane Judge' }]],
  [
    't2',
    [
      { person_id: 'j1', judge_name: 'Jane Judge' },
      { person_id: 'j2', judge_name: 'Sam Steward' },
    ],
  ],
]);

vi.mock('@/features/lunch-orders/judgesOnDays', () => ({
  useJudgesOnDays: () => ({
    byTrial,
    hasData: true,
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
const listForShow = vi.fn();
vi.mock('../showJudgeSuppliesService', () => ({
  showJudgeSuppliesService: { listForShow: (...args: unknown[]) => listForShow(...args) },
}));
const dialog = vi.fn();
vi.mock('../ManageJudgeSuppliesDialog', () => ({
  ManageJudgeSuppliesDialog: (props: Record<string, unknown>) => {
    dialog(props);
    return <div data-testid="manage-dialog" />;
  },
}));

import { ShowJudgeSuppliesTool } from '../ShowJudgeSuppliesTool';
import type { ShowJudgeSupplyRow } from '../types';

const trials = [
  { id: 't1', name: 'Trial 1' },
  { id: 't2', name: 'Trial 2' },
];

function supply(overrides: Partial<ShowJudgeSupplyRow>): ShowJudgeSupplyRow {
  return {
    id: `r-${Math.random()}`,
    show_id: 'show-1',
    person_id: 'j1',
    judge_name: 'Jane Judge',
    item_label: 'Clipboard',
    included: true,
    note: null,
    sort_order: 10,
    is_custom: false,
    created_at: '2026-05-16T00:00:00Z',
    updated_at: '2026-05-16T00:00:00Z',
    ...overrides,
  };
}

describe('ShowJudgeSuppliesTool (MYK9-1728)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    onlineManager.setOnline(true);
    listForShow.mockResolvedValue([]);
  });

  afterEach(() => {
    onlineManager.setOnline(true);
  });

  it('lists a judge on two trials once, naming both trials', async () => {
    render(<ShowJudgeSuppliesTool showId="show-1" trials={trials} />);
    expect(await screen.findAllByRole('button', { name: /edit supplies for/i })).toHaveLength(2);
    expect(screen.getAllByText('Jane Judge')).toHaveLength(1);
    const row = screen.getByTestId('judge-row-j1');
    expect(row).toHaveTextContent('Trial 1');
    expect(row).toHaveTextContent('Trial 2');
    expect(screen.getByTestId('judge-row-j2')).not.toHaveTextContent('Trial 1');
  });

  it('summarizes the judge from the single show list', async () => {
    listForShow.mockResolvedValue([
      supply({ id: 'a' }),
      supply({ id: 'b', item_label: 'Pens (2)', is_custom: true, included: false }),
    ]);
    render(<ShowJudgeSuppliesTool showId="show-1" trials={trials} />);
    await waitFor(() =>
      expect(screen.getByTestId('judge-row-j1')).toHaveTextContent(
        '2 items · 1 custom · 1 excluded'
      )
    );
    expect(listForShow).toHaveBeenCalledWith('show-1');
    expect(screen.getByTestId('judge-row-j2')).toHaveTextContent('Not configured yet');
  });

  it('Edit opens ONE list for the judge, keyed by the show and not by a trial', async () => {
    const { user } = render(
      <ShowJudgeSuppliesTool showId="show-1" organization="UKC" trials={trials} />
    );
    await user.click(await screen.findByRole('button', { name: 'Edit supplies for Jane Judge' }));
    await waitFor(() => expect(screen.getByTestId('manage-dialog')).toBeInTheDocument());
    expect(screen.getAllByTestId('manage-dialog')).toHaveLength(1);
    const props = dialog.mock.lastCall![0] as Record<string, unknown>;
    expect(props).toEqual(
      expect.objectContaining({
        showId: 'show-1',
        registryId: 'UKC',
        judge: expect.objectContaining({ person_id: 'j1' }),
      })
    );
    expect(props).not.toHaveProperty('trialId');
    expect(props).not.toHaveProperty('mirrorTrialIds');
  });

  it('a failed first supplies read stops Loading and offers Try again (MYK9-1735)', async () => {
    listForShow.mockRejectedValueOnce(new Error('network down'));
    const { user } = render(<ShowJudgeSuppliesTool showId="show-1" trials={trials} />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Could not load the judges' supply lists.");
    expect(screen.getByTestId('judge-row-j1')).not.toHaveTextContent('Loading');
    expect(screen.getByTestId('judge-row-j1')).toHaveTextContent('Supplies not loaded');
    // The judges loaded, so the judge-list error never shows: the two failures stay distinct.
    expect(screen.queryByText(/could not load the show's judges/i)).not.toBeInTheDocument();

    listForShow.mockResolvedValueOnce([supply({ id: 'a' })]);
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByTestId('judge-row-j1')).toHaveTextContent('1 item'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByTestId('judge-row-j2')).toHaveTextContent('Not configured yet');
    expect(listForShow).toHaveBeenCalledTimes(2);
  });

  it('keeps cached summaries when a background refresh fails (MYK9-1735)', async () => {
    const queryClient = createTestQueryClient();
    listForShow.mockResolvedValueOnce([supply({ id: 'a' })]);
    render(<ShowJudgeSuppliesTool showId="show-1" trials={trials} />, { queryClient });
    await waitFor(() => expect(screen.getByTestId('judge-row-j1')).toHaveTextContent('1 item'));

    listForShow.mockRejectedValueOnce(new Error('network down'));
    await queryClient.refetchQueries({ queryKey: ['show-judge-supplies', 'show-1'] });
    await waitFor(() =>
      expect(queryClient.getQueryState(['show-judge-supplies', 'show-1'])?.status).toBe('error')
    );
    expect(screen.getByTestId('judge-row-j1')).toHaveTextContent('1 item');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  describe('offline first read (MYK9-1882)', () => {
    it('says supplies are not available offline instead of Loading forever when the read is paused', async () => {
      onlineManager.setOnline(false);
      render(<ShowJudgeSuppliesTool showId="show-1" trials={trials} />);
      await waitFor(() =>
        expect(screen.getByTestId('judge-row-j1')).toHaveTextContent(
          'Not available offline. Connect to load supplies.'
        )
      );
      expect(screen.getByTestId('judge-row-j2')).toHaveTextContent('Not available offline');
      expect(screen.getByTestId('judge-row-j1')).not.toHaveTextContent('Loading');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(listForShow).not.toHaveBeenCalled();
    });

    it('still says Loading while an online read is in flight', async () => {
      let resolve: (rows: ShowJudgeSupplyRow[]) => void = () => {};
      listForShow.mockReturnValueOnce(new Promise<ShowJudgeSupplyRow[]>(r => (resolve = r)));
      render(<ShowJudgeSuppliesTool showId="show-1" trials={trials} />);
      await waitFor(() => expect(listForShow).toHaveBeenCalledTimes(1));
      expect(screen.getByTestId('judge-row-j1')).toHaveTextContent('Loading…');
      expect(screen.getByTestId('judge-row-j1')).not.toHaveTextContent('offline');
      await act(async () => resolve([supply({ id: 'a' })]));
      await waitFor(() => expect(screen.getByTestId('judge-row-j1')).toHaveTextContent('1 item'));
    });

    it('reconnecting loads the rows and replaces the notice without an error', async () => {
      onlineManager.setOnline(false);
      listForShow.mockResolvedValueOnce([supply({ id: 'a' })]);
      render(<ShowJudgeSuppliesTool showId="show-1" trials={trials} />);
      await waitFor(() =>
        expect(screen.getByTestId('judge-row-j1')).toHaveTextContent('Not available offline')
      );
      act(() => onlineManager.setOnline(true));
      await waitFor(() => expect(screen.getByTestId('judge-row-j1')).toHaveTextContent('1 item'));
      expect(screen.queryByText(/not available offline/i)).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('keeps cached rows visible while offline', async () => {
      const queryClient = createTestQueryClient();
      listForShow.mockResolvedValueOnce([supply({ id: 'a' })]);
      render(<ShowJudgeSuppliesTool showId="show-1" trials={trials} />, { queryClient });
      await waitFor(() => expect(screen.getByTestId('judge-row-j1')).toHaveTextContent('1 item'));

      act(() => onlineManager.setOnline(false));
      void queryClient.refetchQueries({ queryKey: ['show-judge-supplies', 'show-1'] });
      await waitFor(() =>
        expect(queryClient.getQueryState(['show-judge-supplies', 'show-1'])?.fetchStatus).toBe(
          'paused'
        )
      );
      expect(screen.getByTestId('judge-row-j1')).toHaveTextContent('1 item');
      expect(screen.queryByText(/not available offline/i)).not.toBeInTheDocument();
    });
  });
});
