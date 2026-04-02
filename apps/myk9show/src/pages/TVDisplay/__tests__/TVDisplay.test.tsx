import { render } from '@/test/utils/testUtils';
import { screen } from '@testing-library/react';
import { vi } from 'vitest';

// Mock hooks before importing the component
vi.mock('../useTVData');
vi.mock('../useTVResults');
vi.mock('../useTVRealtime');

// Mock child components to keep tests focused
vi.mock('../TVGrid', () => ({
  TVGrid: ({ classes }: { classes: { id: string; name: string }[] }) => (
    <div data-testid="tv-grid">
      {classes.map(c => (
        <div key={c.id}>{c.name}</div>
      ))}
    </div>
  ),
}));
vi.mock('../TVMobileList', () => ({
  TVMobileList: () => <div data-testid="tv-mobile-list" />,
}));
vi.mock('../TVPodiumOverlay', () => ({
  TVPodiumOverlay: () => <div data-testid="tv-podium-overlay" />,
}));
vi.mock('../TVSoundToggle', () => ({
  TVSoundToggle: ({ onToggle }: { onToggle: () => void }) => (
    <button onClick={onToggle} data-testid="tv-sound-toggle" />
  ),
}));

// Mock react-router-dom: spread actual module and override hooks
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ showId: 'show-1' }),
    useSearchParams: () => [new URLSearchParams()],
  };
});

import TVDisplay from '../index';
import * as useTVDataModule from '../useTVData';
import * as useTVResultsModule from '../useTVResults';
import * as useTVRealtimeModule from '../useTVRealtime';

const mockShow = {
  id: 'show-1',
  name: 'Spring Trial 2026',
  startDate: '2026-04-01',
  endDate: '2026-04-02',
};

function setupMocks({
  show = mockShow,
  classes = [],
  isLoading = false,
  completedClasses = [],
  isConnected = false,
}: {
  show?: typeof mockShow | null;
  classes?: unknown[];
  isLoading?: boolean;
  completedClasses?: unknown[];
  isConnected?: boolean;
} = {}) {
  vi.mocked(useTVDataModule.useTVData).mockReturnValue({
    show,
    classes: classes as ReturnType<typeof useTVDataModule.useTVData>['classes'],
    isLoading,
    error: null,
  });
  vi.mocked(useTVResultsModule.useTVResults).mockReturnValue({
    completedClasses: completedClasses as ReturnType<
      typeof useTVResultsModule.useTVResults
    >['completedClasses'],
    isLoading: false,
  });
  vi.mocked(useTVRealtimeModule.useTVRealtime).mockReturnValue({ isConnected });
}

describe('TVDisplay', () => {
  it('renders show name in header when data loads', () => {
    setupMocks();
    render(<TVDisplay />);
    expect(screen.getByText('Spring Trial 2026')).toBeInTheDocument();
  });

  it('shows "Loading TV display..." during loading', () => {
    setupMocks({ show: null, isLoading: true });
    render(<TVDisplay />);
    expect(screen.getByText('Loading TV display...')).toBeInTheDocument();
  });

  it('shows "Show not found" when show is null and not loading', () => {
    setupMocks({ show: null, isLoading: false });
    render(<TVDisplay />);
    expect(screen.getByText('Show not found')).toBeInTheDocument();
  });

  it('shows "Live" indicator when realtime is connected', () => {
    setupMocks({ isConnected: true });
    render(<TVDisplay />);
    expect(screen.getByText(/Live/)).toBeInTheDocument();
  });
});
