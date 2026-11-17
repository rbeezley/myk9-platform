import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@/test/utils/testUtils';
import RequestAccessPage from '@/pages/RequestAccessPage';

const mockBrowse = vi.hoisted(() => ({
  data: {
    filteredClubs: [],
    filters: { search: '', clubType: 'all' },
    setFilters: vi.fn(),
    isLoading: false,
    hasError: false,
    handleRetry: vi.fn(),
  },
}));

vi.mock('@/hooks/useBrowseClubsData', () => ({
  useBrowseClubsData: () => mockBrowse.data,
}));

// MYK9-2048: a new club is asked for in one place, the home page form. This page sends
// people there and keeps only the search for joining a club already on myK9Show.
const ADD_YOUR_CLUB_HREF = '/?onboarding=true#get-started';

describe('RequestAccessPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBrowse.data = {
      filteredClubs: [],
      filters: { search: '', clubType: 'all' },
      setFilters: vi.fn(),
      isLoading: false,
      hasError: false,
      handleRetry: vi.fn(),
    };
  });

  it('sends "Set up a new club" to the home page form and keeps the existing-club search', () => {
    render(<RequestAccessPage />, { initialRoute: '/request-access' });

    expect(screen.getByRole('heading', { name: 'Request additional access' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add your club' })).toHaveAttribute(
      'href',
      ADD_YOUR_CLUB_HREF
    );
    expect(screen.queryByRole('button', { name: 'Request a new club' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Find an existing club' })).toBeInTheDocument();
  });

  it('has no new-club form of its own', () => {
    render(<RequestAccessPage />, { initialRoute: '/request-access' });

    fireEvent.click(screen.getByRole('button', { name: 'Find an existing club' }));

    expect(screen.queryByLabelText('Club name')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send request' })).not.toBeInTheDocument();
  });

  it('lets an exhibitor search for an existing club from the page', () => {
    mockBrowse.data = {
      ...mockBrowse.data,
      filters: { search: 'Heartland', clubType: 'all' },
      filteredClubs: [
        {
          id: 'club-1',
          name: 'Heartland Dog Club',
          address: { city: 'Omaha', state: 'NE' },
        },
      ],
    } as typeof mockBrowse.data;

    render(<RequestAccessPage />, { initialRoute: '/request-access' });
    fireEvent.click(screen.getByRole('button', { name: 'Find an existing club' }));

    expect(screen.getByRole('button', { name: /Heartland Dog Club/ })).toBeInTheDocument();
  });

  it('points a search that finds nothing at the home page form', () => {
    mockBrowse.data = {
      ...mockBrowse.data,
      filters: { search: 'Nowhere Kennel', clubType: 'all' },
    };

    render(<RequestAccessPage />, { initialRoute: '/request-access' });
    fireEvent.click(screen.getByRole('button', { name: 'Find an existing club' }));

    expect(screen.getByText(/We couldn.t find that club/)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: "Your club isn't listed? Add your club" })
    ).toHaveAttribute('href', ADD_YOUR_CLUB_HREF);
  });
});
