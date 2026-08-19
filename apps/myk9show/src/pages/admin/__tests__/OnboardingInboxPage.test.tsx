import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render, userEvent } from '@/test/utils/testUtils';
import OnboardingInboxPage from '../OnboardingInboxPage';

const getAllOnboardingRequests = vi.fn();
const updateOnboardingRequest = vi.fn();

vi.mock('@/services/database/onboarding-requests', () => ({
  getAllOnboardingRequests: () => getAllOnboardingRequests(),
  updateOnboardingRequest: (requestId: string, updates: unknown) =>
    updateOnboardingRequest(requestId, updates),
}));

vi.mock('@/lib/notifications', () => ({
  notifications: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const pendingRequest = {
  id: 'onb-1',
  authUserId: 'auth-1',
  clubName: 'Tri-State Kennel Club',
  organization: 'AKC',
  contactName: 'Pat Morgan',
  contactEmail: 'pat@example.com',
  contactPhone: '(555) 123-4567',
  firstShowDate: '2026-09-01',
  message: 'We run four trials a year.',
  status: 'pending' as const,
  createdAt: '2026-07-20T12:00:00Z',
  notes: null,
};

describe('OnboardingInboxPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAllOnboardingRequests.mockResolvedValue([pendingRequest]);
    updateOnboardingRequest.mockImplementation(
      async (_requestId: string, updates: Partial<typeof pendingRequest>) => ({
        ...pendingRequest,
        ...updates,
      })
    );
  });

  it('lists a pending onboarding request with its contact details', async () => {
    render(<OnboardingInboxPage />, { initialRoute: '/admin/onboarding' });

    expect(await screen.findByText('Tri-State Kennel Club')).toBeInTheDocument();
    expect(screen.getByText('pat@example.com')).toBeInTheDocument();
    expect(screen.getByText('We run four trials a year.')).toBeInTheDocument();
  });

  it('disables Save until the admin changes the status or note', async () => {
    render(<OnboardingInboxPage />, { initialRoute: '/admin/onboarding' });

    expect(await screen.findByText('Tri-State Kennel Club')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  it('advances a request to contacted with an internal note', async () => {
    const user = userEvent.setup();
    render(<OnboardingInboxPage />, { initialRoute: '/admin/onboarding' });

    expect(await screen.findByText('Tri-State Kennel Club')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/^status$/i), 'contacted');
    await user.type(screen.getByLabelText(/internal note/i), 'Emailed the secretary.');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(updateOnboardingRequest).toHaveBeenCalledWith('onb-1', {
        status: 'contacted',
        notes: 'Emailed the secretary.',
      });
    });
  });

  it('keeps a row draft visible when saving fails', async () => {
    const user = userEvent.setup();
    updateOnboardingRequest.mockRejectedValueOnce(new Error('write failed'));
    render(<OnboardingInboxPage />, { initialRoute: '/admin/onboarding' });

    expect(await screen.findByText('Tri-State Kennel Club')).toBeInTheDocument();
    const noteInput = screen.getByLabelText(/internal note/i);
    await user.type(noteInput, 'Call again Friday');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Your edits are still here');
    expect(noteInput).toHaveValue('Call again Friday');
  });

  it('uses the authoritative saved row after a concurrent status change', async () => {
    const user = userEvent.setup();
    updateOnboardingRequest.mockResolvedValueOnce({
      ...pendingRequest,
      status: 'contacted',
      notes: 'Updated by another admin',
    });
    render(<OnboardingInboxPage />, { initialRoute: '/admin/onboarding' });

    expect(await screen.findByText('Tri-State Kennel Club')).toBeInTheDocument();
    await user.type(screen.getByLabelText(/internal note/i), 'My follow-up note');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText(/No pending requests/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /contacted \(1\)/i })).toBeInTheDocument();
  });

  it('keeps an unsaved edit in one row when a different row is saved', async () => {
    const user = userEvent.setup();
    const secondRequest = {
      ...pendingRequest,
      id: 'onb-2',
      clubName: 'Harbor Obedience Club',
      contactEmail: 'sam@example.com',
    };
    getAllOnboardingRequests.mockResolvedValue([pendingRequest, secondRequest]);

    render(<OnboardingInboxPage />, { initialRoute: '/admin/onboarding' });

    expect(await screen.findByText('Tri-State Kennel Club')).toBeInTheDocument();

    // Type an unsaved note into the FIRST row, then save the SECOND row.
    const noteInputs = screen.getAllByLabelText(/internal note/i);
    await user.type(noteInputs[0], 'Waiting on callback');

    const statusSelects = screen.getAllByLabelText(/^status$/i);
    await user.selectOptions(statusSelects[1], 'contacted');
    const saveButtons = screen.getAllByRole('button', { name: 'Save changes' });
    await user.click(saveButtons[1]);

    await waitFor(() => {
      expect(updateOnboardingRequest).toHaveBeenCalledWith('onb-2', { status: 'contacted' });
    });

    // The first row's in-progress note must still be there after the refetch.
    expect(screen.getAllByLabelText(/internal note/i)[0]).toHaveValue('Waiting on callback');
  });

  it('shows an empty state when there are no requests in the active filter', async () => {
    getAllOnboardingRequests.mockResolvedValue([]);
    render(<OnboardingInboxPage />, { initialRoute: '/admin/onboarding' });

    expect(await screen.findByText(/You're caught up/i)).toBeInTheDocument();
    expect(screen.queryByText(/No all requests/i)).not.toBeInTheDocument();
  });

  it('offers a recovery action without showing an empty queue when loading fails', async () => {
    getAllOnboardingRequests.mockRejectedValueOnce(new Error('network unavailable'));
    render(<OnboardingInboxPage />, { initialRoute: '/admin/onboarding' });

    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load club requests");
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(screen.queryByText(/No pending requests/i)).not.toBeInTheDocument();
  });

  it('lets an admin leave an empty status filter for the full queue', async () => {
    const user = userEvent.setup();
    render(<OnboardingInboxPage />, { initialRoute: '/admin/onboarding' });

    expect(await screen.findByText('Tri-State Kennel Club')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /contacted \(0\)/i }));

    expect(screen.getByText(/No contacted requests/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /view all 1 request/i }));
    expect(screen.getByText('Tri-State Kennel Club')).toBeInTheDocument();
  });

  it('links contact phone numbers and the existing club management surface', async () => {
    render(<OnboardingInboxPage />, { initialRoute: '/admin/onboarding' });

    expect(await screen.findByRole('link', { name: /\(555\) 123-4567/i })).toHaveAttribute(
      'href',
      'tel:(555)123-4567'
    );
    expect(screen.getByRole('link', { name: /manage clubs/i })).toHaveAttribute('href', '/clubs');
  });

  it('shows the oldest pending request first', async () => {
    getAllOnboardingRequests.mockResolvedValue([
      pendingRequest,
      {
        ...pendingRequest,
        id: 'onb-older',
        clubName: 'Long Waiting Club',
        createdAt: '2026-06-01T12:00:00Z',
      },
    ]);

    render(<OnboardingInboxPage />, { initialRoute: '/admin/onboarding' });

    const requestHeadings = await screen.findAllByRole('heading', { level: 3 });
    expect(requestHeadings.map(heading => heading.textContent)).toEqual([
      'Long Waiting Club',
      'Tri-State Kennel Club',
    ]);
  });
});
