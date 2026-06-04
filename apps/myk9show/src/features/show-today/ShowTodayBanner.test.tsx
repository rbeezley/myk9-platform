import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@/test/utils/testUtils';
import { ShowTodayBanner } from './ShowTodayBanner';
import { useShowTodayBanner } from './useShowTodayBanner';

vi.mock('./useShowTodayBanner');

const mockUseShowTodayBanner = vi.mocked(useShowTodayBanner);
const preFavoriteShow = vi.fn<() => Promise<boolean>>();

function renderBanner() {
  return render(
    <Routes>
      <Route path="/" element={<ShowTodayBanner />} />
      <Route path="/at-show/:showId" element={<div>AT SHOW</div>} />
    </Routes>,
    { initialRoute: '/' }
  );
}

describe('ShowTodayBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    preFavoriteShow.mockResolvedValue(true);
  });

  it('renders nothing for zero shows today', () => {
    mockUseShowTodayBanner.mockReturnValue({
      items: [],
      variant: 'hidden',
      isLoading: false,
      preFavoriteShow,
    });

    renderBanner();

    expect(screen.queryByLabelText('Show today')).not.toBeInTheDocument();
  });

  it('renders a single show CTA and pre-favorites before routing', async () => {
    mockUseShowTodayBanner.mockReturnValue({
      items: [
        {
          showId: 'show-1',
          showName: 'Spring Trial',
          earliestClassTime: '08:30',
          entryCount: 1,
          classCount: 1,
        },
      ],
      variant: 'single',
      isLoading: false,
      preFavoriteShow,
    });

    renderBanner();

    expect(screen.getByLabelText('Show today')).toHaveClass('bg-[#f2faf5]', 'dark:bg-[#16221b]');

    fireEvent.click(screen.getByRole('button', { name: /at the show/i }));

    await waitFor(() => expect(preFavoriteShow).toHaveBeenCalledWith('show-1'));
    expect(await screen.findByText('AT SHOW')).toBeInTheDocument();
  });

  it('still routes when pre-favorite cannot complete', async () => {
    preFavoriteShow.mockRejectedValue(new Error('offline'));
    mockUseShowTodayBanner.mockReturnValue({
      items: [
        {
          showId: 'show-1',
          showName: 'Spring Trial',
          earliestClassTime: '08:30',
          entryCount: 1,
          classCount: 1,
        },
      ],
      variant: 'single',
      isLoading: false,
      preFavoriteShow,
    });

    renderBanner();

    fireEvent.click(screen.getByRole('button', { name: /at the show/i }));

    expect(await screen.findByText('AT SHOW')).toBeInTheDocument();
  });

  it('renders multiple shows in sorted stacked rows', () => {
    mockUseShowTodayBanner.mockReturnValue({
      items: [
        {
          showId: 'show-early',
          showName: 'Morning Trial',
          earliestClassTime: '08:5',
          entryCount: 1,
          classCount: 1,
        },
        {
          showId: 'show-late',
          showName: 'Afternoon Trial',
          earliestClassTime: '13:00',
          entryCount: 1,
          classCount: 1,
        },
      ],
      variant: 'stacked',
      isLoading: false,
      preFavoriteShow,
    });

    renderBanner();

    const rows = screen.getAllByRole('button');
    expect(rows.map(row => row.textContent)).toEqual([
      'Morning TrialFirst class 8:05 AM',
      'Afternoon TrialFirst class 1:00 PM',
    ]);
  });
});
