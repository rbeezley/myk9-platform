/**
 * Integration tests for the Phase 1b smart-input front door.
 *
 * Covers the four flows from the plan §6: render + submit gating, email branch
 * reveals the password step, passcode branch validates + routes (anonymous),
 * and a signed-in passcode routes through the §2.2 confirmation that attaches a
 * show-scoped grant (assertion-first on setGrant's {showId, role}).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, userEvent } from '@/test/utils/testUtils';
import SmartSignInPage from './SmartSignInPage';

const navigateSpy = vi.fn();
vi.mock('react-router-dom', async importOriginal => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateSpy };
});

const setGrantSpy = vi.fn();
vi.mock('@/store/ringsideGrantStore', () => ({
  useRingsideGrantStore: (selector: (s: unknown) => unknown) =>
    selector({ activeGrant: null, setGrant: setGrantSpy, clearGrant: vi.fn() }),
}));

const validatePasscodeMock = vi.fn();
vi.mock('./validatePasscode', () => ({
  validatePasscode: (...args: unknown[]) => validatePasscodeMock(...args),
}));

let mockUser: { id: string } | null = null;
const signInMock = vi.fn();
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    user: mockUser,
    firstName: 'Jane',
    signIn: signInMock,
    signInWithGoogle: vi.fn(),
    loading: false,
  }),
  getPrimaryRole: vi.fn(),
}));

describe('SmartSignInPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = null;
  });

  it('disables Continue until the input is a valid email or passcode', async () => {
    const user = userEvent.setup();
    render(<SmartSignInPage />, { initialRoute: '/sign-in' });

    const button = screen.getByTestId('continue-button');
    expect(button).toBeDisabled();

    await user.type(screen.getByTestId('credential-input'), 'abc');
    expect(button).toBeDisabled();

    await user.clear(screen.getByTestId('credential-input'));
    await user.type(screen.getByTestId('credential-input'), 'jane@example.com');
    expect(button).toBeEnabled();
  });

  it('email branch reveals the password step in place', async () => {
    const user = userEvent.setup();
    render(<SmartSignInPage />, { initialRoute: '/sign-in' });

    await user.type(screen.getByTestId('credential-input'), 'jane@example.com');
    await user.click(screen.getByTestId('continue-button'));

    expect(await screen.findByTestId('password-input')).toBeInTheDocument();
    expect(screen.getByTestId('locked-credential')).toHaveTextContent('jane@example.com');
  });

  it('anonymous passcode validates and routes straight to ringside', async () => {
    validatePasscodeMock.mockResolvedValue({
      ok: true,
      role: 'judge',
      showId: 'show-x',
      showName: 'Spring Trial',
    });
    const user = userEvent.setup();
    render(<SmartSignInPage />, { initialRoute: '/sign-in' });

    await user.type(screen.getByTestId('credential-input'), 'j9f3b');
    await user.click(screen.getByTestId('continue-button'));

    await waitFor(() => expect(validatePasscodeMock).toHaveBeenCalledWith('j9f3b'));
    expect(setGrantSpy).toHaveBeenCalledWith({
      showId: 'show-x',
      role: 'judge',
      source: 'passcode',
    });
    await waitFor(() => expect(navigateSpy).toHaveBeenCalledWith('/at-show/show-x'));
  });

  it('prefills the smart field from a show-access code query param', () => {
    render(<SmartSignInPage />, { initialRoute: '/at-show?code=J9F3B' });

    expect(screen.getByTestId('credential-input')).toHaveValue('J9F3B');
    expect(screen.getByTestId('continue-button')).toBeEnabled();
  });

  it('signed-in passcode confirms, then attaches a show-scoped grant and routes', async () => {
    mockUser = { id: 'user-1' };
    validatePasscodeMock.mockResolvedValue({
      ok: true,
      role: 'judge',
      showId: 'show-x',
      showName: 'Spring Trial',
    });
    const user = userEvent.setup();
    render(<SmartSignInPage />, { initialRoute: '/sign-in' });

    await user.type(screen.getByTestId('credential-input'), 'j9f3b');
    await user.click(screen.getByTestId('continue-button'));

    // Confirmation appears with humanized role + show name; no grant yet.
    expect(await screen.findByText('Join this show?')).toBeInTheDocument();
    expect(screen.getByText(/join Spring Trial as a judge/i)).toBeInTheDocument();
    expect(setGrantSpy).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Join show' }));

    expect(setGrantSpy).toHaveBeenCalledWith({
      showId: 'show-x',
      role: 'judge',
      source: 'passcode',
    });
    expect(navigateSpy).toHaveBeenCalledWith('/at-show/show-x');
  });

  it('shows a calm error when the passcode is rejected', async () => {
    validatePasscodeMock.mockResolvedValue({
      ok: false,
      kind: 'invalid',
      message: "That credential wasn't recognized.",
    });
    const user = userEvent.setup();
    render(<SmartSignInPage />, { initialRoute: '/sign-in' });

    await user.type(screen.getByTestId('credential-input'), 'a1234');
    await user.click(screen.getByTestId('continue-button'));

    expect(await screen.findByText("That credential wasn't recognized.")).toBeInTheDocument();
    expect(navigateSpy).not.toHaveBeenCalled();
  });
});
