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

    const banner = screen.getByLabelText('Show today');
    expect(banner).toHaveClass('rounded-lg', 'border', 'border-success/40');
    // DESIGN.md bans colored side-stripe borders (border-left > 1px) on cards
    // and alerts, and every green here must come from the --success token so it
    // flips with the theme. Raw `emerald-*` used to sit beside `text-success`,
    // rendering two different greens in one component.
    expect(banner.className).not.toMatch(/border-l-\d/);
    expect(banner.className).not.toMatch(/emerald/);
    expect(screen.getByText('Show day is here')).toBeInTheDocument();
    expect(screen.getByText('Spring Trial')).toBeInTheDocument();
    // `text-foreground`, not muted: muted measures 4.10:1 on this bg-success/10
    // fill in dark mode, under the 4.5:1 AA floor for body text.
    expect(screen.getByText('First class 8:30 AM').parentElement).toHaveClass('text-foreground');
    expect(screen.getByText('1 entry')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /go to show day/i }));

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

    fireEvent.click(screen.getByRole('button', { name: /go to show day/i }));

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
