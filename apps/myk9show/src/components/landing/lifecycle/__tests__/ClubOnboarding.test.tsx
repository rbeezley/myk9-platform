import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@/test/utils/testUtils';
import { ClubOnboarding } from './ClubOnboarding';

const mockSubmit = vi.fn();
const mockGetRequests = vi.fn();
const mockUser = {
  id: 'user-1',
  email: 'club@example.com',
  user_metadata: { firstName: 'Pat', lastName: 'Morgan' },
};

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    user: mockUser,
  }),
}));

vi.mock('@/services/database/onboarding-requests', () => ({
  submitOnboardingRequest: (...args: unknown[]) => mockSubmit(...args),
  getMyOnboardingRequests: (...args: unknown[]) => mockGetRequests(...args),
}));

vi.mock('@/services/LoggingService', () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}));

describe('ClubOnboarding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRequests.mockResolvedValue([]);
  });

  it('shows a friendly message when an active request wins a concurrent submit', async () => {
    mockSubmit.mockRejectedValue({ code: '23505', message: 'duplicate key value' });
    render(<ClubOnboarding />, { initialRoute: '/' });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /submit request/i })).toBeInTheDocument()
    );
    fireEvent.change(screen.getByLabelText(/club name/i), {
      target: { value: 'Tri-State Kennel Club' },
    });
    fireEvent.change(screen.getByLabelText(/organization/i), { target: { value: 'AKC' } });
    fireEvent.change(screen.getByLabelText(/contact name/i), { target: { value: 'Pat Morgan' } });
    fireEvent.change(screen.getByLabelText(/contact email/i), {
      target: { value: 'club@example.com' },
    });
    fireEvent.submit(screen.getByRole('button', { name: /submit request/i }).closest('form')!);

    await waitFor(() =>
      expect(screen.getByText(/already have a request under review/i)).toBeInTheDocument()
    );
  });
});
