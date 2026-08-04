import { render, screen } from '@/test/utils/testUtils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ActivityTab from '../ActivityTab';

// MYK9-121, acceptance criterion 2: an empty upcoming list is only "nothing
// booked" when the read is authoritative. `getEntriesByDog` is online-first and
// reports `verified`; an offline result comes from the local replica, which for
// a dog is only ever a lower bound because entries replicate per-show. Overview
// must apply the same rule Career does — these two surfaces disagreeing is the
// bug MYK9-121 reported in the first place.

const useEntriesByDogQueryMock = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/queries/useEntriesDatabase', () => ({
  useEntriesByDogQuery: useEntriesByDogQueryMock,
}));

describe('ActivityTab never asserts an empty calendar it cannot vouch for', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useEntriesByDogQueryMock.mockReturnValue({
      data: { rows: [], verified: true },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
  });

  it('offers retry instead of "no upcoming entries" when the read failed', () => {
    useEntriesByDogQueryMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    });

    render(<ActivityTab dogId="dog-1" dogName="Willow" role="exhibitor" />);

    expect(screen.queryByText('No upcoming entries for Willow')).toBeNull();
    expect(screen.getByText("We couldn't load Willow's entries just now.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('says so rather than asserting an empty calendar while offline', () => {
    useEntriesByDogQueryMock.mockReturnValue({
      data: { rows: [], verified: false },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<ActivityTab dogId="dog-1" dogName="Willow" role="exhibitor" />);

    expect(screen.queryByText('No upcoming entries for Willow')).toBeNull();
    expect(
      screen.getByText("You're offline, so Willow's entries may not have loaded.")
    ).toBeInTheDocument();
  });

  it('retries through the canonical query', async () => {
    const refetch = vi.fn();
    useEntriesByDogQueryMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    });

    const { user } = render(<ActivityTab dogId="dog-1" dogName="Willow" role="exhibitor" />);
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(refetch).toHaveBeenCalled();
  });

  it('still shows the plain empty state when the read resolved online', () => {
    render(<ActivityTab dogId="dog-1" dogName="Willow" role="exhibitor" />);

    expect(screen.getByText('No upcoming entries for Willow')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });
});
