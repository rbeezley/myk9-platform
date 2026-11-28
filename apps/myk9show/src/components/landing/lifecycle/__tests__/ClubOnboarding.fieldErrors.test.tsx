import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@/test/utils/testUtils';
import { ClubOnboarding } from '../ClubOnboarding';

const mockSubmit = vi.fn();
const auth = vi.hoisted(() => ({
  user: null as null | { id: string; email: string; user_metadata: Record<string, string> },
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ ...auth, refreshPermissions: vi.fn().mockResolvedValue(undefined) }),
}));
vi.mock('@/services/database/club-access-requests.request', () => ({
  ClubNameTakenError: class extends Error {},
  TooManyClubRequestsError: class extends Error {},
  TOO_MANY_CLUB_REQUESTS_MESSAGE: 'too many',
  requestNewClub: (...args: unknown[]) => mockSubmit(...args),
}));
vi.mock('@/services/LoggingService', () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));

const submit = () =>
  fireEvent.submit(screen.getByRole('button', { name: /add my club/i }).closest('form')!);

describe('ClubOnboarding required-field callouts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.user = { id: 'user-1', email: '', user_metadata: {} };
  });

  it('puts a callout under each empty field, focuses the first, and drops the bottom line', async () => {
    render(<ClubOnboarding />, { initialRoute: '/' });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /add my club/i })).toBeInTheDocument()
    );
    submit();

    expect(mockSubmit).not.toHaveBeenCalled();
    const club = screen.getByLabelText(/club name/i);
    expect(screen.getByText('Enter the club name.')).toBeInTheDocument();
    expect(screen.getByText('Enter at least one club number.')).toBeInTheDocument();
    expect(club).toHaveAttribute('aria-invalid', 'true');
    expect(club).toHaveAttribute('aria-describedby', 'onb-club-name-error');
    expect(screen.getByLabelText('AKC club number')).toHaveAttribute('aria-invalid', 'true');
    expect(club).toHaveFocus();
    expect(document.querySelector('.l-error')).toBeNull();

    fireEvent.change(club, { target: { value: 'Tri-State' } });
    expect(screen.queryByText('Enter the club name.')).not.toBeInTheDocument();
    expect(club).not.toHaveAttribute('aria-invalid');
  });

  it('keeps a failed submission in the bottom line', async () => {
    mockSubmit.mockRejectedValue(new Error('boom'));
    render(<ClubOnboarding />, { initialRoute: '/' });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /add my club/i })).toBeInTheDocument()
    );
    fireEvent.change(screen.getByLabelText(/club name/i), { target: { value: 'K' } });
    fireEvent.change(screen.getByLabelText('AKC club number'), { target: { value: '1' } });
    submit();
    await waitFor(() =>
      expect(screen.getByText("We couldn't add your club. Try again.")).toBeInTheDocument()
    );
  });
});
