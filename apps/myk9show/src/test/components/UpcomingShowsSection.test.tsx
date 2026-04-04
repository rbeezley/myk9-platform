import { screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@/test/utils/testUtils';
import UpcomingShowsSection from '@/components/dogs/DogDetails/Competitions/UpcomingShows/UpcomingShowsSection';
import { useCompetitionStore } from '@/store/competitionStore';

// Mock PremiumButton to avoid @myk9/ui resolution issue
vi.mock('@/components/common/PremiumButton', () => ({
  PremiumButton: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}));

// Mock IconContainer
vi.mock('@/components/common/IconContainer', () => ({
  IconContainer: () => <div data-testid="icon-container" />,
}));

// Mock dialog components to keep tests focused
vi.mock('@/components/dogs/DogDetails/Competitions/UpcomingShows/AddExternalShowDialog', () => ({
  default: () => <div data-testid="add-dialog" />,
}));

vi.mock('@/components/dogs/DogDetails/Competitions/UpcomingShows/ShowDetailsDialog', () => ({
  default: () => <div data-testid="show-details-dialog" />,
}));

vi.mock('@/components/common/StandardDialog', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="standard-dialog">{children}</div>
  ),
}));

vi.mock('@/components/common/ThreeDotMenu', () => ({
  default: () => <div data-testid="three-dot-menu" />,
}));

vi.mock('@/components/common/SectionCard', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="section-card">{children}</div>
  ),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('UpcomingShowsSection', () => {
  const defaultProps = {
    showAddDialog: false,
    onAddDialogClose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset competition store to empty state before each test
    useCompetitionStore.setState({ competitions: [] });
  });

  it('shows empty state when there are no competitions', () => {
    render(<UpcomingShowsSection {...defaultProps} />);

    expect(screen.getByText('No Upcoming Shows')).toBeInTheDocument();
    expect(
      screen.getByText(
        'When you enter a show, it will appear here. Browse available shows to find one near you.'
      )
    ).toBeInTheDocument();
  });

  it('shows Browse Shows button in empty state', () => {
    render(<UpcomingShowsSection {...defaultProps} />);

    const browseButton = screen.getByText('Browse Shows');
    expect(browseButton).toBeInTheDocument();
  });

  it('navigates to /shows when Browse Shows is clicked', async () => {
    const { user } = render(<UpcomingShowsSection {...defaultProps} />);

    const browseButton = screen.getByText('Browse Shows');
    await user.click(browseButton);

    expect(mockNavigate).toHaveBeenCalledWith('/shows');
  });

  it('does not show empty state when competitions exist', () => {
    useCompetitionStore.setState({
      competitions: [
        {
          id: '1',
          name: 'Spring Classic',
          date: '2026-05-15',
          location: 'Austin, TX',
          status: 'Upcoming',
          dogId: 'dog-1',
        },
      ],
    });

    render(<UpcomingShowsSection {...defaultProps} />);

    expect(screen.queryByText('No Upcoming Shows')).not.toBeInTheDocument();
    expect(screen.getByText('Spring Classic')).toBeInTheDocument();
    expect(screen.getByText('Austin, TX')).toBeInTheDocument();
  });

  it('does not inject mock/fake data when store is empty', () => {
    render(<UpcomingShowsSection {...defaultProps} />);

    // Verify no competition cards are rendered
    expect(screen.queryAllByTestId('section-card')).toHaveLength(0);
    // Verify no mock show names appear
    expect(screen.queryByText('Spring Classic')).not.toBeInTheDocument();
    expect(screen.queryByText('Lone Star Invitational')).not.toBeInTheDocument();
    expect(screen.queryByText('River City Challenge')).not.toBeInTheDocument();
  });

  it('renders multiple competitions when store has data', () => {
    useCompetitionStore.setState({
      competitions: [
        {
          id: '1',
          name: 'Spring Classic',
          date: '2026-05-15',
          location: 'Austin, TX',
          status: 'Upcoming',
          dogId: 'dog-1',
        },
        {
          id: '2',
          name: 'Fall Nationals',
          date: '2026-10-01',
          location: 'Dallas, TX',
          status: 'Upcoming',
          dogId: 'dog-1',
        },
      ],
    });

    render(<UpcomingShowsSection {...defaultProps} />);

    expect(screen.getByText('Spring Classic')).toBeInTheDocument();
    expect(screen.getByText('Fall Nationals')).toBeInTheDocument();
    expect(screen.getAllByTestId('section-card')).toHaveLength(2);
  });
});
