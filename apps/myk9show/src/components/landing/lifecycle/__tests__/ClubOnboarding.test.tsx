import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@/test/utils/testUtils';
import { ClubOnboarding } from '../ClubOnboarding';
import { BANNED_COPY } from '../lifecycleStories';
import { readClubOnboardingDraft, saveClubOnboardingDraft } from '../clubOnboardingDraft';

const mockSubmit = vi.fn();
const mockRefreshPermissions = vi.hoisted(() => vi.fn());
const mockNavigate = vi.hoisted(() => vi.fn());
const mockHoldsClubRole = vi.hoisted(() => vi.fn());
const auth = vi.hoisted(() => ({
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

vi.mock('../clubRoleLoaded', () => ({
  userHoldsClubRole: (...args: unknown[]) => mockHoldsClubRole(...args),
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
  fireEvent.change(screen.getByLabelText(/organization/i), { target: { value: 'AKC' } });
  fireEvent.change(screen.getByLabelText(/contact name/i), { target: { value: 'Pat Morgan' } });
  fireEvent.change(screen.getByLabelText(/contact email/i), {
    target: { value: 'club@example.com' },
  });
}

function submitForm() {
  fireEvent.submit(screen.getByRole('button', { name: /add my club/i }).closest('form')!);
}

const fullDraft = {
  clubName: 'Tri-State Kennel Club',
  organization: 'AKC',
  clubNumbers: { AKC: '', UKC: '', ASCA: '' },
  contactName: 'Pat Morgan',
  contactEmail: 'club@example.com',
  contactPhone: '',
  firstShowDate: '',
  message: '',
};

const created = { clubId: 'club-9', requestId: 'request-9', alreadyRequested: false };

describe('ClubOnboarding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    mockRefreshPermissions.mockResolvedValue(undefined);
    mockHoldsClubRole.mockResolvedValue(true);
    auth.user = signedInUser;
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
        note: expect.stringContaining('Organization: AKC'),
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
    expect(mockHoldsClubRole).toHaveBeenCalledWith('user-1', 'club-9');
    expect(mockNavigate).toHaveBeenCalledWith('/secretary/dashboard?clubId=club-9');
    expect(screen.queryByTestId('club-roles-pending')).not.toBeInTheDocument();
    expect(readClubOnboardingDraft()).toBeNull();
  });

  it.each([
    [
      'the refresh resolves but her roles still lack the club',
      () => {
        mockHoldsClubRole.mockResolvedValue(false);
      },
    ],
    [
      'the refresh throws',
      () => {
        mockRefreshPermissions.mockRejectedValue(new Error('offline'));
      },
    ],
  ])('keeps her here, with her draft, when %s', async (_name, arrange) => {
    arrange();
    mockSubmit.mockResolvedValue(created);
    saveClubOnboardingDraft(fullDraft);
    render(<ClubOnboarding />, { initialRoute: '/' });
    fillRequiredFields();
    fireEvent.change(screen.getByLabelText('AKC club number'), { target: { value: '123' } });
    submitForm();

    expect(await screen.findByTestId('club-roles-pending')).toHaveTextContent(
      "Your club was created. We couldn't load it yet; open your dashboard in a moment."
    );
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(readClubOnboardingDraft()).not.toBeNull();
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

  it('keeps the return target through the sign-in redirect', () => {
    auth.user = null;
    render(<ClubOnboarding />, { initialRoute: '/?onboarding=true&returnTo=%2Fwizard%3Fx%3D1' });
    fillRequiredFields();
    fireEvent.change(screen.getByLabelText('AKC club number'), { target: { value: '123' } });
    fireEvent.submit(
      screen.getByRole('button', { name: /sign in to add my club/i }).closest('form')!
    );

    const redirectTo = new URL(String(mockNavigate.mock.calls[0][0]), 'http://x').searchParams.get(
      'redirectTo'
    );
    expect(redirectTo).toBe('/?onboarding=true&returnTo=%2Fwizard%3Fx%3D1#get-started');
  });

  it('loads her new roles before the saved draft is cleared, then shows success', async () => {
    const order: string[] = [];
    saveClubOnboardingDraft(fullDraft);
    mockSubmit.mockResolvedValue(created);
    mockRefreshPermissions.mockImplementation(async () => {
      order.push(
        readClubOnboardingDraft() ? 'refresh (draft still saved)' : 'refresh (draft gone)'
      );
    });
    render(<ClubOnboarding />, { initialRoute: '/' });
    fireEvent.change(screen.getByLabelText('AKC club number'), { target: { value: '123' } });
    submitForm();

    expect(await screen.findByText(/waiting for myK9Show approval/i)).toBeInTheDocument();
    expect(order).toEqual(['refresh (draft still saved)']);
    expect(readClubOnboardingDraft()).toBeNull();
  });

  it('still shows success and keeps the draft when the roles refresh fails', async () => {
    saveClubOnboardingDraft(fullDraft);
    mockSubmit.mockResolvedValue(created);
    mockRefreshPermissions.mockRejectedValue(new Error('offline'));
    render(<ClubOnboarding />, { initialRoute: '/' });
    fireEvent.change(screen.getByLabelText('AKC club number'), { target: { value: '123' } });
    submitForm();

    expect(await screen.findByText(/waiting for myK9Show approval/i)).toBeInTheDocument();
    expect(readClubOnboardingDraft()).not.toBeNull();
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

  it('says how to join a club already on myK9Show and offers only AKC, UKC and ASCA', () => {
    render(<ClubOnboarding />, { initialRoute: '/' });
    expect(screen.getByText(/already on myK9Show\? Ask its admin to add you/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /find your club/i })).toHaveAttribute(
      'href',
      '/request-access'
    );
    const options = within(screen.getByLabelText(/organization/i)).getAllByRole('option');
    expect(options.map(o => o.textContent)).toEqual(['Select organization…', 'AKC', 'UKC', 'ASCA']);
  });

  it('sends a signed-out visitor to sign in and keeps what she typed', () => {
    auth.user = null;
    const first = render(<ClubOnboarding />, { initialRoute: '/' });
    fillRequiredFields();
    fireEvent.change(screen.getByLabelText('UKC club number'), { target: { value: 'U-9' } });
    fireEvent.submit(
      screen.getByRole('button', { name: /sign in to add my club/i }).closest('form')!
    );

    expect(mockSubmit).not.toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(String(mockNavigate.mock.calls[0][0])).toContain('/sign-in');

    first.unmount();
    render(<ClubOnboarding />, { initialRoute: '/' });
    expect(screen.getByLabelText(/club name/i)).toHaveValue('Tri-State Kennel Club');
    expect(screen.getByLabelText('UKC club number')).toHaveValue('U-9');
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
