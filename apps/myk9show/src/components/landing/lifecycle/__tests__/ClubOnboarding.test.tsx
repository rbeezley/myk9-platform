import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@/test/utils/testUtils';
import { ClubOnboarding } from '../ClubOnboarding';
import { UserRole } from '@/types/auth-types';
import { BANNED_COPY } from '../lifecycleStories';

const mockSubmit = vi.fn();
const mockRefreshPermissions = vi.hoisted(() => vi.fn());
const mockNavigate = vi.hoisted(() => vi.fn());
const auth = vi.hoisted(() => ({
  loading: false,
  userWithRoles: undefined as undefined | { scopes: unknown[] },
  refreshPermissions: (...args: unknown[]) => mockRefreshPermissions(...args),
  user: null as null | {
    id: string;
    email: string;
    user_metadata: { firstName: string; lastName: string };
  },
}));
const signedInUser = {
  id: 'user-1',
  email: 'club@example.com',
  user_metadata: { firstName: 'Pat', lastName: 'Morgan' },
};

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => auth,
}));

vi.mock('react-router-dom', async importOriginal => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => mockNavigate,
}));

vi.mock('@/services/database/club-access-requests.request', () => {
  class ClubNameTakenError extends Error {}
  class TooManyClubRequestsError extends Error {}
  return {
    ClubNameTakenError,
    TooManyClubRequestsError,
    TOO_MANY_CLUB_REQUESTS_MESSAGE:
      "You already have 3 club requests waiting. We'll answer those first.",
    requestNewClub: (...args: unknown[]) => mockSubmit(...args),
  };
});

vi.mock('@/services/LoggingService', () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}));

function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText(/club name/i), {
    target: { value: 'Tri-State Kennel Club' },
  });
}

function submitForm() {
  fireEvent.submit(screen.getByRole('button', { name: /add my club/i }).closest('form')!);
}

// What the auth provider holds once the refresh has applied the new club's role.
const grantClubRole = () => {
  auth.userWithRoles = {
    scopes: [{ scopeType: 'club', scopeId: 'club-9', roleId: UserRole.CLUB_ADMIN }],
  };
};

const created = { clubId: 'club-9', requestId: 'request-9', alreadyRequested: false };

describe('ClubOnboarding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    localStorage.clear();
    mockRefreshPermissions.mockImplementation(async () => grantClubRole());
    auth.userWithRoles = undefined;
    auth.user = signedInUser;
    auth.loading = false;
  });

  it('creates the club and points her at it, waiting for approval', async () => {
    mockSubmit.mockResolvedValue(created);
    render(<ClubOnboarding />, { initialRoute: '/' });
    fillRequiredFields();
    fireEvent.change(screen.getByLabelText('AKC club number'), { target: { value: '123' } });
    submitForm();

    expect(await screen.findByText(/waiting for myK9Show approval/i)).toBeInTheDocument();
    expect(screen.queryByText(/unauthorized/i)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /get your first show published/i })).toHaveAttribute(
      'href',
      '/secretary/dashboard?clubId=club-9'
    );
    expect(mockSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        clubName: 'Tri-State Kennel Club',
        clubNumbers: { AKC: '123' },
        note: expect.stringMatching(/Registries: AKC #123\nContact: Pat Morgan <club@example.com>/),
      })
    );
  });

  it('lands on the dashboard for the new club once her roles are loaded', async () => {
    mockSubmit.mockResolvedValue(created);
    render(<ClubOnboarding />, { initialRoute: '/' });
    fillRequiredFields();
    fireEvent.change(screen.getByLabelText('AKC club number'), { target: { value: '123' } });
    submitForm();

    await screen.findByText(/waiting for myK9Show approval/i);
    // The navigate happens in a passive effect after the render that shows the text, so it can
    // land a tick after the text appears; wait for the call itself, not for the text.
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('/secretary/dashboard?clubId=club-9')
    );
    expect(screen.queryByTestId('club-roles-pending')).not.toBeInTheDocument();
  });

  it.each([
    [
      'the refresh resolves but her roles still lack the club',
      () => {
        mockRefreshPermissions.mockResolvedValue(undefined);
      },
    ],
    [
      'the refresh throws',
      () => {
        mockRefreshPermissions.mockRejectedValue(new Error('offline'));
      },
    ],
  ])('keeps her here when %s', async (_name, arrange) => {
    arrange();
    mockSubmit.mockResolvedValue(created);
    render(<ClubOnboarding />, { initialRoute: '/' });
    fillRequiredFields();
    fireEvent.change(screen.getByLabelText('AKC club number'), { target: { value: '123' } });
    submitForm();

    expect(await screen.findByTestId('club-roles-pending')).toHaveTextContent(
      "Your club was created. We couldn't load it yet; open your dashboard in a moment."
    );
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('retries the roles refresh from the recovery button and navigates only once the auth context holds the club role', async () => {
    mockRefreshPermissions.mockResolvedValue(undefined);
    mockSubmit.mockResolvedValue(created);
    render(<ClubOnboarding />, { initialRoute: '/?onboarding=true' });
    fillRequiredFields();
    fireEvent.change(screen.getByLabelText('AKC club number'), { target: { value: '123' } });
    submitForm();
    await screen.findByTestId('club-roles-pending');
    expect(mockRefreshPermissions).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /get your first show published/i }));
    await waitFor(() => expect(mockRefreshPermissions).toHaveBeenCalledTimes(2));
    await screen.findByTestId('club-roles-pending');
    expect(mockNavigate).not.toHaveBeenCalled();

    mockRefreshPermissions.mockImplementation(async () => grantClubRole());
    fireEvent.click(screen.getByRole('button', { name: /get your first show published/i }));
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('/secretary/dashboard?clubId=club-9')
    );
    expect(mockRefreshPermissions).toHaveBeenCalledTimes(3);
  });

  it('does not navigate away when she came from the wizard', async () => {
    mockSubmit.mockResolvedValue(created);
    render(<ClubOnboarding />, { initialRoute: '/?returnTo=%2Fwizard' });
    fillRequiredFields();
    fireEvent.change(screen.getByLabelText('AKC club number'), { target: { value: '123' } });
    submitForm();

    await screen.findByRole('link', { name: /back to your show/i });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('leads back to the show she started, with the new club chosen', async () => {
    mockSubmit.mockResolvedValue(created);
    render(<ClubOnboarding />, {
      initialRoute: '/?onboarding=true&returnTo=%2Fwizard%3Fx%3D1%26clubId%3Dold',
    });
    fillRequiredFields();
    fireEvent.change(screen.getByLabelText('AKC club number'), { target: { value: '123' } });
    submitForm();

    expect(await screen.findByRole('link', { name: /back to your show/i })).toHaveAttribute(
      'href',
      '/wizard?x=1&clubId=club-9&clubCreated=1'
    );
    expect(screen.getByRole('link', { name: /open your club/i })).toHaveAttribute(
      'href',
      '/clubs/club-9'
    );
  });

  it('ignores an unsafe return target', async () => {
    mockSubmit.mockResolvedValue(created);
    render(<ClubOnboarding />, { initialRoute: '/?returnTo=%2F%2Fevil.com' });
    fillRequiredFields();
    fireEvent.change(screen.getByLabelText('AKC club number'), { target: { value: '123' } });
    submitForm();

    expect(
      await screen.findByRole('link', { name: /get your first show published/i })
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /back to your show/i })).not.toBeInTheDocument();
  });

  it('refuses a taken club name in plain words with a way to reach us', async () => {
    const { ClubNameTakenError } = await import('@/services/database/club-access-requests.request');
    mockSubmit.mockRejectedValue(new ClubNameTakenError());
    render(<ClubOnboarding />, { initialRoute: '/' });
    fillRequiredFields();
    fireEvent.change(screen.getByLabelText('AKC club number'), { target: { value: '123' } });
    submitForm();

    const refusal = await screen.findByTestId('club-name-taken');
    expect(refusal).toHaveTextContent(
      "A club with this name is already on myK9Show. If it's yours, ask its admin to add you, or email us."
    );
    expect(within(refusal).getByRole('link', { name: /email us/i })).toHaveAttribute(
      'href',
      'mailto:support@myk9show.com'
    );
    expect(screen.queryByText(/waiting for myK9Show approval/i)).not.toBeInTheDocument();
  });

  it('says plainly that she has too many requests waiting, with no retry hint', async () => {
    const { TooManyClubRequestsError } =
      await import('@/services/database/club-access-requests.request');
    mockSubmit.mockRejectedValue(new TooManyClubRequestsError());
    render(<ClubOnboarding />, { initialRoute: '/' });
    fillRequiredFields();
    fireEvent.change(screen.getByLabelText('AKC club number'), { target: { value: '123' } });
    submitForm();

    expect(
      await screen.findByText("You already have 3 club requests waiting. We'll answer those first.")
    ).toBeInTheDocument();
    expect(screen.queryByText(/try again/i)).not.toBeInTheDocument();
  });

  it('says how to join a club already on myK9Show ', () => {
    render(<ClubOnboarding />, { initialRoute: '/' });
    expect(screen.getByText(/already on myK9Show\? Ask its admin to add you/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /find your club/i })).toHaveAttribute(
      'href',
      '/request-access'
    );
  });

  describe('signed out (MYK9-2547)', () => {
    it('shows no form, says why, and sends her to sign in or sign up, then back to the form', () => {
      auth.user = null;
      render(<ClubOnboarding />, { initialRoute: '/?onboarding=true&returnTo=%2Fwizard%3Fx%3D1' });

      expect(screen.getByText('Sign in or create your account to add your club.')).toBeVisible();
      expect(screen.queryByLabelText(/club name/i)).not.toBeInTheDocument();
      const back = '/?onboarding=true&returnTo=%2Fwizard%3Fx%3D1#get-started';
      expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
        'href',
        `/sign-in?redirectTo=${encodeURIComponent(back)}`
      );
      expect(screen.getByRole('link', { name: 'Create account' })).toHaveAttribute(
        'href',
        `/sign-up?returnTo=${encodeURIComponent(back)}`
      );
    });

    it('waits while sign-in is still loading instead of flashing the prompt', () => {
      auth.user = null;
      auth.loading = true;
      render(<ClubOnboarding />, { initialRoute: '/' });
      expect(screen.queryByTestId('club-sign-in-gate')).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/club name/i)).not.toBeInTheDocument();
    });

    it('treats an anonymous passcode session as signed out', () => {
      Object.assign(auth, { user: { ...signedInUser, is_anonymous: true } });
      render(<ClubOnboarding />, { initialRoute: '/' });
      expect(screen.getByTestId('club-sign-in-gate')).toBeInTheDocument();
    });
  });

  it('takes the contact from her account: no organization or contact fields, no phone needed', async () => {
    mockSubmit.mockResolvedValue(created);
    render(<ClubOnboarding />, { initialRoute: '/' });
    expect(screen.queryByLabelText(/organization/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/contact name/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/contact email/i)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/club name/i), { target: { value: 'Tri-State' } });
    fireEvent.change(screen.getByLabelText('ASCA club number'), { target: { value: 'A-1' } });
    submitForm();

    await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1));
    const note = mockSubmit.mock.calls[0]![0].note as string;
    expect(note).toBe('Registries: ASCA #A-1\nContact: Pat Morgan <club@example.com>');
  });

  it('keeps a failed submission in the bottom line', async () => {
    mockSubmit.mockRejectedValue(new Error('boom'));
    render(<ClubOnboarding />, { initialRoute: '/' });
    fillRequiredFields();
    fireEvent.change(screen.getByLabelText('AKC club number'), { target: { value: '123' } });
    submitForm();
    expect(await screen.findByText("We couldn't add your club. Try again.")).toBeInTheDocument();
  });

  describe('club numbers (MYK9-1235)', () => {
    async function openForm() {
      render(<ClubOnboarding />, { initialRoute: '/' });
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /add my club/i })).toBeInTheDocument()
      );
      fillRequiredFields();
    }

    it('asks for an AKC, UKC and ASCA club number', async () => {
      await openForm();
      for (const label of ['AKC club number', 'UKC club number', 'ASCA club number']) {
        expect(screen.getByLabelText(label)).toBeInTheDocument();
      }
      expect(screen.getByText(/enter at least one/i)).toBeInTheDocument();
    });

    it('refuses to submit with no club number', async () => {
      await openForm();
      fireEvent.change(screen.getByLabelText('UKC club number'), { target: { value: '   ' } });
      submitForm();

      expect(await screen.findByText('Enter at least one club number.')).toBeInTheDocument();
      expect(mockSubmit).not.toHaveBeenCalled();
    });

    it('submits an AKC-only club with just that number', async () => {
      mockSubmit.mockResolvedValue(created);
      await openForm();
      fireEvent.change(screen.getByLabelText('AKC club number'), { target: { value: ' 4521 ' } });
      submitForm();

      await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1));
      expect(mockSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ clubNumbers: { AKC: '4521' } })
      );
    });

    it('submits a UKC-only club with just that number', async () => {
      mockSubmit.mockResolvedValue(created);
      await openForm();
      fireEvent.change(screen.getByLabelText('UKC club number'), { target: { value: 'U-9' } });
      submitForm();
      await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1));
      expect(mockSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ clubNumbers: { UKC: 'U-9' } })
      );
    });

    it('sends every number entered when a club has two', async () => {
      mockSubmit.mockResolvedValue(created);
      await openForm();
      fireEvent.change(screen.getByLabelText('AKC club number'), { target: { value: '4521' } });
      fireEvent.change(screen.getByLabelText('UKC club number'), { target: { value: 'U-9' } });
      submitForm();
      await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1));
      expect(mockSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ clubNumbers: { AKC: '4521', UKC: 'U-9' } })
      );
    });
  });

  it('leads with the club heading', () => {
    render(<ClubOnboarding />, { initialRoute: '/' });
    expect(
      screen.getByRole('heading', { level: 2, name: /add your club to myk9show/i })
    ).toBeInTheDocument();
  });

  it('contains no banned copy in the signed-out state', () => {
    auth.user = null;
    const { container } = render(<ClubOnboarding />);
    for (const re of BANNED_COPY) expect(container.textContent ?? '').not.toMatch(re);
  });
});
