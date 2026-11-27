import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes, useNavigate } from 'react-router-dom';
import { fireEvent, render, screen } from '@/test/utils/testUtils';
import { ClubOnboarding } from '../ClubOnboarding';

// MYK9-2469: a signed-out visitor fills the form, is sent to sign in, and presses Back. Real
// navigation here (the sibling test file mocks it): the form must remount on its own history
// entry with what she typed.
const auth = vi.hoisted(() => ({
  userWithRoles: undefined,
  refreshPermissions: vi.fn(),
  user: null,
}));

vi.mock('@/hooks/useAuthContext', () => ({ useAuthContext: () => auth }));
vi.mock('@/services/database/club-access-requests.request', () => ({
  ClubNameTakenError: class extends Error {},
  TooManyClubRequestsError: class extends Error {},
  TOO_MANY_CLUB_REQUESTS_MESSAGE: '',
  requestNewClub: vi.fn(),
}));
vi.mock('@/services/LoggingService', () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}));

function SignInStub() {
  const navigate = useNavigate();
  return (
    <div>
      <p>Sign in page</p>
      <button type="button" onClick={() => navigate(-1)}>
        Back
      </button>
    </div>
  );
}

describe('ClubOnboarding back from sign-in', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('shows what she typed when she goes back from the sign-in page', async () => {
    render(
      <Routes>
        <Route path="/" element={<ClubOnboarding />} />
        <Route path="/sign-in" element={<SignInStub />} />
      </Routes>,
      { initialRoute: '/?onboarding=true#get-started' }
    );
    fireEvent.change(screen.getByLabelText(/club name/i), {
      target: { value: 'Tri-State Kennel Club' },
    });
    fireEvent.change(screen.getByLabelText(/organization/i), { target: { value: 'AKC' } });
    fireEvent.change(screen.getByLabelText('AKC club number'), { target: { value: '123' } });
    fireEvent.change(screen.getByLabelText(/contact name/i), { target: { value: 'Pat Morgan' } });
    fireEvent.change(screen.getByLabelText(/contact email/i), {
      target: { value: 'pat@example.com' },
    });
    fireEvent.submit(
      screen.getByRole('button', { name: /sign in to add my club/i }).closest('form')!
    );

    expect(await screen.findByText('Sign in page')).toBeInTheDocument();
    expect(screen.queryByLabelText(/club name/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(await screen.findByLabelText(/club name/i)).toHaveValue('Tri-State Kennel Club');
    expect(screen.getByLabelText(/organization/i)).toHaveValue('AKC');
    expect(screen.getByLabelText('AKC club number')).toHaveValue('123');
    expect(screen.getByLabelText(/contact name/i)).toHaveValue('Pat Morgan');
    expect(screen.getByLabelText(/contact email/i)).toHaveValue('pat@example.com');
  });
});
