import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@/test/utils/testUtils';
import { ClubOnboarding } from '../ClubOnboarding';

const mockSubmit = vi.fn();
const auth = vi.hoisted(() => ({
  user: null as null | { id: string; email: string; user_metadata: Record<string, string> },
}));

vi.mock('@/hooks/useAuthContext', () => ({ useAuthContext: () => auth }));
vi.mock('@/services/database/onboarding-requests', () => ({
  submitOnboardingRequest: (...args: unknown[]) => mockSubmit(...args),
  getMyOnboardingRequests: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/services/LoggingService', () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));

const submit = () =>
  fireEvent.submit(screen.getByRole('button', { name: /submit request/i }).closest('form')!);

describe('ClubOnboarding required-field callouts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.user = { id: 'user-1', email: '', user_metadata: {} };
  });

  it('puts a callout under each empty field, focuses the first, and drops the bottom line', async () => {
    render(<ClubOnboarding />, { initialRoute: '/' });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /submit request/i })).toBeInTheDocument()
    );
    submit();

    expect(mockSubmit).not.toHaveBeenCalled();
    const club = screen.getByLabelText(/club name/i);
    expect(screen.getByText('Enter the club name.')).toBeInTheDocument();
    expect(screen.getByText('Choose an organization.')).toBeInTheDocument();
    expect(screen.getByText('Enter at least one club number.')).toBeInTheDocument();
    expect(screen.getByText('Enter your name.')).toBeInTheDocument();
    expect(screen.getByText('Enter your email address.')).toBeInTheDocument();
    expect(club).toHaveAttribute('aria-invalid', 'true');
    expect(club).toHaveAttribute('aria-describedby', 'onb-club-name-error');
    expect(screen.getByLabelText('AKC club number')).toHaveAttribute('aria-invalid', 'true');
    expect(club).toHaveFocus();
    expect(document.querySelector('.l-error')).toBeNull();

    fireEvent.change(club, { target: { value: 'Tri-State' } });
    expect(screen.queryByText('Enter the club name.')).not.toBeInTheDocument();
    expect(club).not.toHaveAttribute('aria-invalid');
  });

  it('treats a malformed email as a field error under the email', async () => {
    render(<ClubOnboarding />, { initialRoute: '/' });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /submit request/i })).toBeInTheDocument()
    );
    fireEvent.change(screen.getByLabelText(/contact email/i), { target: { value: 'nope' } });
    submit();

    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();
    expect(screen.getByLabelText(/contact email/i)).toHaveAttribute('aria-invalid', 'true');
  });

  it('keeps a failed submission in the bottom line', async () => {
    mockSubmit.mockRejectedValue(new Error('boom'));
    render(<ClubOnboarding />, { initialRoute: '/' });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /submit request/i })).toBeInTheDocument()
    );
    fireEvent.change(screen.getByLabelText(/club name/i), { target: { value: 'K' } });
    fireEvent.change(screen.getByLabelText(/organization/i), { target: { value: 'AKC' } });
    fireEvent.change(screen.getByLabelText('AKC club number'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/contact name/i), { target: { value: 'P' } });
    fireEvent.change(screen.getByLabelText(/contact email/i), { target: { value: 'a@b.co' } });
    submit();
    await waitFor(() =>
      expect(screen.getByText('Something went wrong. Please try again.')).toBeInTheDocument()
    );
  });
});
