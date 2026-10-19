import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@/test/utils/testUtils';
import RequestAccessPage from '@/pages/RequestAccessPage';
import { submitNewClubAccessRequest } from '@/services/database/club-access-requests';

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
    fireEvent.change(screen.getByLabelText('AKC club number'), { target: { value: '4521' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }));

    await waitFor(() => {
      expect(submitNewClubAccessRequest).toHaveBeenCalledWith({
        clubName: 'Heartland Dog Club',
        website: '',
        note: '',
        clubNumbers: { AKC: '4521' },
      });
    });
    expect(await screen.findByRole('heading', { name: 'Request sent' })).toBeInTheDocument();
  });

  it('normalizes a bare domain website to https:// on blur', () => {
    render(<RequestAccessPage />, { initialRoute: '/request-access' });

    fireEvent.click(screen.getByRole('button', { name: 'Request a new club' }));
    const websiteInput = screen.getByLabelText('Club website (optional)');
    fireEvent.change(websiteInput, { target: { value: 'myclub.org' } });
    fireEvent.blur(websiteInput);

    expect(websiteInput).toHaveValue('https://myclub.org/');
  });

  it('saves a bare www domain website as https:// on submit', async () => {
    vi.mocked(submitNewClubAccessRequest).mockResolvedValue('request-1');
    render(<RequestAccessPage />, { initialRoute: '/request-access' });

    fireEvent.click(screen.getByRole('button', { name: 'Request a new club' }));
    fireEvent.change(screen.getByLabelText('Club name'), {
      target: { value: 'Heartland Dog Club' },
    });
    fireEvent.change(screen.getByLabelText('Club website (optional)'), {
      target: { value: 'www.myclub.org' },
    });
    fireEvent.change(screen.getByLabelText('UKC club number'), { target: { value: 'U-7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }));

    await waitFor(() => {
      expect(submitNewClubAccessRequest).toHaveBeenCalledWith({
        clubName: 'Heartland Dog Club',
        website: 'https://www.myclub.org/',
        note: '',
        clubNumbers: { UKC: 'U-7' },
      });
    });
  });

  it('saves a real https:// website value in canonical form on submit', async () => {
    vi.mocked(submitNewClubAccessRequest).mockResolvedValue('request-1');
    render(<RequestAccessPage />, { initialRoute: '/request-access' });

    fireEvent.click(screen.getByRole('button', { name: 'Request a new club' }));
    fireEvent.change(screen.getByLabelText('Club name'), {
      target: { value: 'Heartland Dog Club' },
    });
    fireEvent.change(screen.getByLabelText('Club website (optional)'), {
      target: { value: 'https://myclub.org' },
    });
    fireEvent.change(screen.getByLabelText('UKC club number'), { target: { value: 'U-7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }));

    await waitFor(() => {
      expect(submitNewClubAccessRequest).toHaveBeenCalledWith({
        clubName: 'Heartland Dog Club',
        website: 'https://myclub.org/',
        note: '',
        clubNumbers: { UKC: 'U-7' },
      });
    });
  });

  it('shows an error and does not submit when the website is still not a valid URL', async () => {
    render(<RequestAccessPage />, { initialRoute: '/request-access' });

    fireEvent.click(screen.getByRole('button', { name: 'Request a new club' }));
    fireEvent.change(screen.getByLabelText('Club name'), {
      target: { value: 'Heartland Dog Club' },
    });
    fireEvent.change(screen.getByLabelText('Club website (optional)'), {
      target: { value: 'myclub' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }));

    expect(await screen.findByText(/enter a valid website/i)).toBeInTheDocument();
    expect(submitNewClubAccessRequest).not.toHaveBeenCalled();
  });

  it('refuses a new club request with no club number', async () => {
    render(<RequestAccessPage />, { initialRoute: '/request-access' });

    fireEvent.click(screen.getByRole('button', { name: 'Request a new club' }));
    fireEvent.change(screen.getByLabelText('Club name'), {
      target: { value: 'Heartland Dog Club' },
    });
    fireEvent.change(screen.getByLabelText('ASCA club number'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }));

    expect(await screen.findByText('Enter at least one club number.')).toBeInTheDocument();
    expect(submitNewClubAccessRequest).not.toHaveBeenCalled();
  });

  it('sends every club number entered when a club holds two', async () => {
    vi.mocked(submitNewClubAccessRequest).mockResolvedValue('request-1');
    render(<RequestAccessPage />, { initialRoute: '/request-access' });

    fireEvent.click(screen.getByRole('button', { name: 'Request a new club' }));
    expect(screen.getByText(/enter at least one/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Club name'), {
      target: { value: 'Heartland Dog Club' },
    });
    fireEvent.change(screen.getByLabelText('AKC club number'), { target: { value: ' 4521 ' } });
    fireEvent.change(screen.getByLabelText('UKC club number'), { target: { value: 'U-7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }));

    await waitFor(() => {
      expect(submitNewClubAccessRequest).toHaveBeenCalledWith(
        expect.objectContaining({ clubNumbers: { AKC: '4521', UKC: 'U-7' } })
      );
    });
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

  it('puts callouts under the club name and website, focuses the name, and clears when fixed', async () => {
    render(<RequestAccessPage />, { initialRoute: '/request-access' });

    fireEvent.click(screen.getByRole('button', { name: 'Request a new club' }));
    fireEvent.change(screen.getByLabelText('Club website (optional)'), {
      target: { value: 'myclub' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }));

    const name = screen.getByLabelText('Club name');
    expect(screen.getByText('Enter the club name.')).toBeInTheDocument();
    expect(screen.getByText(/enter a valid website, like example\.com/i)).toBeInTheDocument();
    expect(screen.getByText('Enter at least one club number.')).toBeInTheDocument();
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveAttribute('aria-describedby', 'requested-club-name-error');
    expect(screen.getByLabelText('Club website (optional)')).toHaveAttribute(
      'aria-invalid',
      'true'
    );
    expect(name).toHaveFocus();
    expect(screen.queryByText(/before sending your request/i)).not.toBeInTheDocument();
    expect(submitNewClubAccessRequest).not.toHaveBeenCalled();

    fireEvent.change(name, { target: { value: 'Heartland' } });
    expect(screen.queryByText('Enter the club name.')).not.toBeInTheDocument();
  });
});
