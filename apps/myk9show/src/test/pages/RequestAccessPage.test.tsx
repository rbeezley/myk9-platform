import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@/test/utils/testUtils';
import RequestAccessPage from '@/pages/RequestAccessPage';
import { submitNewClubAccessRequest } from '@/services/database/club-access-requests';
import { notifyAccessRequestEmail } from '@/services/notifications/accessRequestEmail';

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

vi.mock('@/services/database/club-access-requests', () => ({
  submitNewClubAccessRequest: vi.fn(),
}));

vi.mock('@/services/notifications/accessRequestEmail', () => ({
  notifyAccessRequestEmail: vi.fn(async () => undefined),
}));

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

  it('offers new-club and existing-club paths without sending users through onboarding', () => {
    render(<RequestAccessPage />, { initialRoute: '/request-access' });

    expect(screen.getByRole('heading', { name: 'Request additional access' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Request a new club' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Find an existing club' })).toBeInTheDocument();
    expect(screen.queryByText(/onboarding/i)).not.toBeInTheDocument();
  });

  it('submits a new club request with the simple form', async () => {
    vi.mocked(submitNewClubAccessRequest).mockResolvedValue('request-1');
    render(<RequestAccessPage />, { initialRoute: '/request-access' });

    fireEvent.click(screen.getByRole('button', { name: 'Request a new club' }));
    fireEvent.change(screen.getByLabelText('Club name'), {
      target: { value: 'Heartland Dog Club' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }));

    await waitFor(() => {
      expect(submitNewClubAccessRequest).toHaveBeenCalledWith({
        clubName: 'Heartland Dog Club',
        website: '',
        note: '',
      });
    });
    expect(await screen.findByRole('heading', { name: 'Request sent' })).toBeInTheDocument();
    expect(notifyAccessRequestEmail).toHaveBeenCalledWith('new_club', 'request-1');
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
});
