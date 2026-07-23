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
    updateOnboardingRequest.mockResolvedValue(undefined);
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
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('advances a request to contacted with an internal note', async () => {
    const user = userEvent.setup();
    render(<OnboardingInboxPage />, { initialRoute: '/admin/onboarding' });

    expect(await screen.findByText('Tri-State Kennel Club')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/status/i), 'contacted');
    await user.type(screen.getByLabelText(/internal note/i), 'Emailed the secretary.');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(updateOnboardingRequest).toHaveBeenCalledWith('onb-1', {
        status: 'contacted',
        notes: 'Emailed the secretary.',
      });
    });
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

    const statusSelects = screen.getAllByLabelText(/status/i);
    await user.selectOptions(statusSelects[1], 'contacted');
    const saveButtons = screen.getAllByRole('button', { name: 'Save' });
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

    expect(await screen.findByText(/No pending requests/i)).toBeInTheDocument();
  });
});
