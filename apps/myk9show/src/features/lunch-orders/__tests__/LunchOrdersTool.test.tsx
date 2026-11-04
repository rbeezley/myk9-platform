import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';

const { saveMock, listMock } = vi.hoisted(() => ({
  saveMock: vi.fn(),
  listMock: vi.fn(),
}));

vi.mock('../lunchOrdersService', () => ({
  lunchOrdersService: { listForTrial: listMock, save: saveMock, remove: vi.fn() },
}));
vi.mock('@/features/judge-supplies/useTrialJudges', () => ({
  useTrialJudges: () => ({ data: [{ person_id: 'p-judge', judge_name: 'Jo Judge' }] }),
}));
vi.mock('@/hooks/queries/useShowOfficials', () => ({
  useShowOfficials: () => ({
    data: {
      secretaries: [
        {
          personId: 'p-sec',
          firstName: 'Sam',
          lastName: 'Secretary',
          email: null,
          role: 'secretary',
        },
      ],
      chairmen: [],
      stewards: [],
    },
  }),
}));
vi.mock('../useLunchOrders', async importOriginal => {
  const actual = await importOriginal<typeof import('../useLunchOrders')>();
  return {
    ...actual,
    useVolunteersOnDays: () => ({
      data: [{ personId: 'p-vol', name: 'Vic Volunteer', trialId: 'trial-1' }],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    }),
  };
});

import { LunchOrdersTool } from '../LunchOrdersTool';

describe('LunchOrdersTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listMock.mockResolvedValue([]);
    saveMock.mockResolvedValue(undefined);
  });

  it('heads each day with a readable date, not the raw ISO string', async () => {
    render(
      <LunchOrdersTool
        showId="show-1"
        trials={[{ id: 'trial-1', name: 'Saturday', trialDate: '2026-11-07' }]}
      />
    );

    expect(await screen.findByText('Saturday, November 7, 2026')).toBeInTheDocument();
    expect(screen.queryByText('2026-11-07')).not.toBeInTheDocument();
  });

  it('lists the day assignments without writing anything', async () => {
    render(<LunchOrdersTool showId="show-1" trials={[{ id: 'trial-1', name: 'Saturday' }]} />);

    expect(await screen.findByLabelText('Lunch order for Jo Judge')).toBeInTheDocument();
    expect(screen.getByLabelText('Lunch order for Sam Secretary')).toBeInTheDocument();
    expect(screen.getByLabelText('Lunch order for Vic Volunteer')).toBeInTheDocument();
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('saves the typed lunch order for a person on blur, as one row for that day', async () => {
    const user = userEvent.setup();
    render(<LunchOrdersTool showId="show-1" trials={[{ id: 'trial-1', name: 'Saturday' }]} />);

    await user.type(await screen.findByLabelText('Lunch order for Jo Judge'), 'Wrap');
    await user.tab();

    await waitFor(() =>
      expect(saveMock).toHaveBeenCalledWith({
        trialId: 'trial-1',
        savedId: null,
        personId: 'p-judge',
        name: 'Jo Judge',
        role: 'judge',
        lunchOrder: 'Wrap',
      })
    );
  });

  it('adds someone else by name with the chosen role', async () => {
    const user = userEvent.setup();
    render(<LunchOrdersTool showId="show-1" trials={[{ id: 'trial-1', name: 'Saturday' }]} />);

    await user.type(await screen.findByLabelText('Add person'), 'Pat Guest');
    await user.click(screen.getByRole('button', { name: 'Add to list' }));

    await waitFor(() =>
      expect(saveMock).toHaveBeenCalledWith({
        trialId: 'trial-1',
        savedId: null,
        personId: null,
        name: 'Pat Guest',
        role: 'club_member',
      })
    );
  });
});
