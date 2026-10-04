import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import type { User } from '@supabase/supabase-js';
import { UserRole } from '@/types/auth-types';
import ExhibitorOnboardingPage from '../ExhibitorOnboardingPage';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useExhibitorProfile } from '@/hooks/useExhibitorProfile';
import { fromPartial } from '@total-typescript/shoehorn';

const navigateMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: vi.fn(),
}));

vi.mock('@/hooks/useExhibitorProfile', () => ({
  useExhibitorProfile: vi.fn(),
}));

vi.mock('../steps/StepDogs', () => ({
  StepDogs: ({ onSkip }: { onSkip: () => void }) => (
    <div>
      <div>Add your dogs</div>
      <button type="button" onClick={onSkip}>
        Skip for now
      </button>
    </div>
  ),
}));

const mockUseAuthContext = vi.mocked(useAuthContext);
const mockUseExhibitorProfile = vi.mocked(useExhibitorProfile);

function setupAuth(roles: UserRole[]) {
  mockUseAuthContext.mockReturnValue(
    fromPartial({
      user: {
        id: 'auth-user-id',
        email: 'secretary@myk9t.com',
        user_metadata: { first_name: 'Test', last_name: 'Secretary' },
      },
      userWithRoles: {
        id: 'auth-user-id',
        email: 'secretary@myk9t.com',
        roles,
        permissions: [],
        scopes: [],
      },
      loading: false,
      rbacLoading: false,
    })
  );
}

function setupUnauthenticated() {
  mockUseAuthContext.mockReturnValue({
    user: null,
    userWithRoles: null,
    loading: false,
    rbacLoading: false,
  } as ReturnType<typeof useAuthContext>);
}

beforeEach(() => {
  navigateMock.mockClear();
  setupAuth([UserRole.EXHIBITOR]);
  mockUseExhibitorProfile.mockReturnValue({
    profile: null,
    isLoading: false,
    error: null,
    createProfileAsync: vi.fn(),
    isCreatingProfile: false,
    completeOnboarding: vi.fn(),
    isCompletingOnboarding: false,
  } as unknown as ReturnType<typeof useExhibitorProfile>);
});

describe('ExhibitorOnboardingPage', () => {
  it('shows a skeleton while authenticated context is still loading', () => {
    mockUseAuthContext.mockReturnValue({
      user: { id: 'auth-user-id' } as User,
      userWithRoles: null,
      loading: true,
      rbacLoading: true,
    } as ReturnType<typeof useAuthContext>);

    render(<ExhibitorOnboardingPage />);

    expect(screen.getByRole('status', { name: 'Loading onboarding' })).toBeInTheDocument();
    expect(document.querySelector('.animate-spin')).toBeNull();
  });

  // MYK9-970: the STAFF_ROLES skip is gone. A secretary gets the same flow as
  // everyone else instead of being bounced to their dashboard.
  it('gives a secretary the onboarding flow instead of redirecting them to a dashboard', () => {
    setupAuth([UserRole.SECRETARY]);

    render(<ExhibitorOnboardingPage />);

    expect(screen.getByText('Tell us about yourself')).toBeInTheDocument();
    expect(screen.getByText('1 of 4')).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('renders the onboarding wizard for exhibitor users', () => {
    setupAuth([UserRole.EXHIBITOR]);

    render(<ExhibitorOnboardingPage />);

    expect(screen.getByText('Tell us about yourself')).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('starts at the dogs step when signup already created the exhibitor profile', () => {
    setupAuth([UserRole.EXHIBITOR]);
    mockUseExhibitorProfile.mockReturnValue({
      profile: {
        id: 'profile-id',
        person_id: 'person-id',
        auth_user_id: 'auth-user-id',
        default_handler_id: null,
        subscription_tier: 'free',
        subscription_expires_at: null,
        stripe_customer_id: null,
        onboarding_completed_at: null,
        created_at: '2026-07-06T00:00:00.000Z',
        updated_at: '2026-07-06T00:00:00.000Z',
      },
      isLoading: false,
      error: null,
      createProfileAsync: vi.fn(),
      isCreatingProfile: false,
      completeOnboarding: vi.fn(),
      isCompletingOnboarding: false,
    } as unknown as ReturnType<typeof useExhibitorProfile>);

    render(<ExhibitorOnboardingPage />);

    expect(screen.getByText('Add your dogs')).toBeInTheDocument();
    expect(screen.getByText('1 of 2')).toBeInTheDocument();
    expect(screen.queryByText('Tell us about yourself')).not.toBeInTheDocument();
  });

  // MYK9-1010: signup's trigger makes the profile without an address; AKC entries need one.
  describe('when the signup profile has no mailing address', () => {
    function setupProfileWithoutAddress() {
      const savePersonDetailsAsync = vi.fn().mockResolvedValue(undefined);
      const createProfileAsync = vi.fn();
      mockUseExhibitorProfile.mockReturnValue({
        profile: {
          id: 'profile-id',
          person_id: 'person-id',
          auth_user_id: 'auth-user-id',
          onboarding_completed_at: null,
          onboarded_roles: [],
          person: {
            id: 'person-id',
            first_name: 'Casey',
            last_name: 'Morgan',
            email: 'casey@example.com',
            phone: null,
            profile_image: null,
            street_address: null,
            city: null,
            state: null,
            zip_code: null,
          },
        },
        isLoading: false,
        error: null,
        createProfileAsync,
        isCreatingProfile: false,
        savePersonDetailsAsync,
        isSavingPersonDetails: false,
        completeOnboarding: vi.fn(),
        isCompletingOnboarding: false,
      } as unknown as ReturnType<typeof useExhibitorProfile>);
      return { savePersonDetailsAsync, createProfileAsync };
    }

    it('asks for the address first, prefilled with the stored name', () => {
      setupAuth([UserRole.EXHIBITOR]);
      setupProfileWithoutAddress();

      render(<ExhibitorOnboardingPage />);

      expect(screen.getByText('Tell us about yourself')).toBeInTheDocument();
      expect(screen.getByText('1 of 3')).toBeInTheDocument();
      expect(screen.getByLabelText(/first name/i)).toHaveValue('Casey');
    });

    it('refuses to continue without the address', () => {
      setupAuth([UserRole.EXHIBITOR]);
      const { savePersonDetailsAsync } = setupProfileWithoutAddress();

      render(<ExhibitorOnboardingPage />);
      fireEvent.submit(screen.getByTestId('step-profile'));

      expect(screen.getByRole('alert')).toHaveTextContent(
        'Please enter your street address, city, state, ZIP code.'
      );
      expect(savePersonDetailsAsync).not.toHaveBeenCalled();
    });

    it('saves the address onto the existing person instead of creating a profile', async () => {
      setupAuth([UserRole.EXHIBITOR]);
      const { savePersonDetailsAsync, createProfileAsync } = setupProfileWithoutAddress();

      render(<ExhibitorOnboardingPage />);
      fireEvent.change(screen.getByLabelText(/street address/i), {
        target: { value: ' 1 Main St ' },
      });
      fireEvent.change(screen.getByLabelText(/^city/i), { target: { value: 'Tulsa' } });
      fireEvent.change(screen.getByLabelText(/^state/i), { target: { value: 'OK' } });
      fireEvent.change(screen.getByLabelText(/zip code/i), { target: { value: '74101' } });
      fireEvent.submit(screen.getByTestId('step-profile'));

      await waitFor(() => {
        expect(savePersonDetailsAsync).toHaveBeenCalledWith({
          firstName: 'Casey',
          lastName: 'Morgan',
          email: expect.any(String),
          address: { streetAddress: '1 Main St', city: 'Tulsa', state: 'OK', zipCode: '74101' },
        });
      });
      expect(createProfileAsync).not.toHaveBeenCalled();
    });
  });

  it('redirects completed exhibitors away from onboarding instead of restarting the wizard', async () => {
    setupAuth([UserRole.EXHIBITOR]);
    mockUseExhibitorProfile.mockReturnValue({
      profile: {
        id: 'profile-id',
        person_id: 'person-id',
        auth_user_id: 'auth-user-id',
        default_handler_id: null,
        subscription_tier: 'free',
        subscription_expires_at: null,
        stripe_customer_id: null,
        onboarding_completed_at: '2026-07-07T12:00:00.000Z',
        created_at: '2026-07-06T00:00:00.000Z',
        updated_at: '2026-07-07T12:00:00.000Z',
      },
      isLoading: false,
      error: null,
      createProfileAsync: vi.fn(),
      isCreatingProfile: false,
      completeOnboarding: vi.fn(),
      isCompletingOnboarding: false,
    } as unknown as ReturnType<typeof useExhibitorProfile>);

    render(<ExhibitorOnboardingPage />);

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/shows', { replace: true });
    });
    expect(screen.queryByText('Add your dogs')).not.toBeInTheDocument();
  });

  it('lets incomplete profile-created exhibitors skip optional dogs and finish to /shows', async () => {
    const completeOnboarding = vi.fn().mockResolvedValue('2026-07-07T12:00:00.000Z');
    setupAuth([UserRole.EXHIBITOR]);
    mockUseExhibitorProfile.mockReturnValue({
      profile: {
        id: 'profile-id',
        person_id: 'person-id',
        auth_user_id: 'auth-user-id',
        default_handler_id: null,
        subscription_tier: 'free',
        subscription_expires_at: null,
        stripe_customer_id: null,
        onboarding_completed_at: null,
        created_at: '2026-07-06T00:00:00.000Z',
        updated_at: '2026-07-06T00:00:00.000Z',
      },
      isLoading: false,
      error: null,
      createProfileAsync: vi.fn(),
      isCreatingProfile: false,
      completeOnboarding,
      isCompletingOnboarding: false,
    } as unknown as ReturnType<typeof useExhibitorProfile>);

    render(<ExhibitorOnboardingPage />);

    fireEvent.click(screen.getByRole('button', { name: /skip for now/i }));
    fireEvent.click(screen.getByRole('button', { name: /browse shows/i }));

    await waitFor(() => {
      expect(completeOnboarding).toHaveBeenCalledOnce();
      expect(navigateMock).toHaveBeenCalledWith('/shows', { replace: true });
    });
  });

  // MYK9-858: the final step's "Account Profile" / "Account Notifications"
  // links used to be bare react-router Links. `onboarding_completed_at` is
  // only ever set inside `completeOnboarding()`, which only the Finish button
  // called — so following either link left it null, and the
  // ExhibitorOnboardingChecker guard on /account bounced the user straight
  // back to /onboarding step 1.
  it('completes onboarding and lands on the profile section when Account Profile is clicked from the final step', async () => {
    const completeOnboarding = vi.fn().mockResolvedValue('2026-07-07T12:00:00.000Z');
    setupAuth([UserRole.EXHIBITOR]);
    mockUseExhibitorProfile.mockReturnValue({
      profile: {
        id: 'profile-id',
        person_id: 'person-id',
        auth_user_id: 'auth-user-id',
        default_handler_id: null,
        subscription_tier: 'free',
        subscription_expires_at: null,
        stripe_customer_id: null,
        onboarding_completed_at: null,
        created_at: '2026-07-06T00:00:00.000Z',
        updated_at: '2026-07-06T00:00:00.000Z',
      },
      isLoading: false,
      error: null,
      createProfileAsync: vi.fn(),
      isCreatingProfile: false,
      completeOnboarding,
      isCompletingOnboarding: false,
    } as unknown as ReturnType<typeof useExhibitorProfile>);

    render(<ExhibitorOnboardingPage />);

    fireEvent.click(screen.getByRole('button', { name: /skip for now/i }));
    fireEvent.click(screen.getByRole('link', { name: /account profile/i }));

    await waitFor(() => {
      expect(completeOnboarding).toHaveBeenCalledOnce();
    });
    expect(navigateMock).toHaveBeenLastCalledWith('/account?section=profile', { replace: true });
    expect(navigateMock).not.toHaveBeenCalledWith('/shows', { replace: true });
  });

  it('completes onboarding and lands on the notifications section when Account Notifications is clicked from the final step', async () => {
    const completeOnboarding = vi.fn().mockResolvedValue('2026-07-07T12:00:00.000Z');
    setupAuth([UserRole.EXHIBITOR]);
    mockUseExhibitorProfile.mockReturnValue({
      profile: {
        id: 'profile-id',
        person_id: 'person-id',
        auth_user_id: 'auth-user-id',
        default_handler_id: null,
        subscription_tier: 'free',
        subscription_expires_at: null,
        stripe_customer_id: null,
        onboarding_completed_at: null,
        created_at: '2026-07-06T00:00:00.000Z',
        updated_at: '2026-07-06T00:00:00.000Z',
      },
      isLoading: false,
      error: null,
      createProfileAsync: vi.fn(),
      isCreatingProfile: false,
      completeOnboarding,
      isCompletingOnboarding: false,
    } as unknown as ReturnType<typeof useExhibitorProfile>);

    render(<ExhibitorOnboardingPage />);

    fireEvent.click(screen.getByRole('button', { name: /skip for now/i }));
    fireEvent.click(screen.getByRole('link', { name: /account notifications/i }));

    await waitFor(() => {
      expect(completeOnboarding).toHaveBeenCalledOnce();
    });
    expect(navigateMock).toHaveBeenLastCalledWith('/account?section=notifications', {
      replace: true,
    });
    expect(navigateMock).not.toHaveBeenCalledWith('/shows', { replace: true });
  });

  it('redirects unauthenticated users to sign in instead of showing profile creation', async () => {
    setupUnauthenticated();

    render(<ExhibitorOnboardingPage />);

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/sign-in?returnTo=/onboarding', {
        replace: true,
      });
    });
    expect(screen.queryByText('Tell us about yourself')).not.toBeInTheDocument();
  });
  /**
   * The page renders UNDER the fixed AppHeader and nothing above it applies an
   * offset, so a plain `py-10` put "Welcome to myK9Show" behind the header bar
   * (found in the 2026-09-10 manual page audit, exhibitor group).
   *
   * WHAT THIS CAN AND CANNOT PROVE: jsdom performs no layout and applies no
   * Tailwind rules, so there is no rendered `padding-top` to measure here. It
   * cannot prove the heading clears the header. What it does prove is the thing
   * that actually regresses: the loading shell and the loaded shell are one
   * shared constant, so a future edit cannot fix or break the offset on only
   * one of them and leave the content jumping between states. The positive
   * proof is the browser measurement: the class resolves to 88px, being the
   * 48px header plus 2.5rem, against 0px for an identical class absent from
   * source.
   */
  it('gives the loading and loaded shells the same header-clearing offset', () => {
    const shellOf = (root: HTMLElement) =>
      (root.querySelector('.min-h-screen') as HTMLElement | null)?.className ?? null;

    setupAuth([UserRole.EXHIBITOR]);
    const loaded = render(<ExhibitorOnboardingPage />);
    const loadedShell = shellOf(loaded.container);
    loaded.unmount();

    mockUseExhibitorProfile.mockReturnValue({
      profile: null,
      isLoading: true,
      error: null,
      createProfileAsync: vi.fn(),
      isCreatingProfile: false,
      completeOnboarding: vi.fn(),
      isCompletingOnboarding: false,
    } as unknown as ReturnType<typeof useExhibitorProfile>);
    const loading = render(<ExhibitorOnboardingPage />);
    const loadingShell = shellOf(loading.container);

    expect(loadedShell).not.toBeNull();
    expect(loadingShell).toBe(loadedShell);
    // The HEADER height, not --app-top-inset: this is in-flow content and
    // PWAInstallBanner's spacer already applies the banner offset above it.
    // Using the full inset double-counts the banner (caught in review of #2196).
    expect(loadedShell).toContain('pt-[calc(var(--app-header-height,3rem)+2.5rem)]');
    expect(loadedShell).not.toMatch(/\bpy-10\b/);
  });

  /**
   * The auth-loading skeleton centres rather than stacking, so the header never
   * clipped it — it sat half the header's height too high, because `min-h-screen`
   * centres against the whole viewport including the strip behind the fixed
   * header. Same token, different arithmetic: this one keeps the 1rem the old
   * `p-4` gave it rather than the 2.5rem the stacked shells use.
   *
   * Same caveat as above: jsdom lays nothing out, so this pins the offset is
   * DECLARED, not that the box ends up centred. The claim it defends is that
   * all three shells on this page move together — every previous fix here
   * corrected one shell and left its siblings behind.
   */
  it('offsets the auth-loading skeleton by the same chrome inset', () => {
    mockUseAuthContext.mockReturnValue({
      user: { id: 'auth-user-id' } as User,
      userWithRoles: null,
      loading: true,
      rbacLoading: true,
    } as ReturnType<typeof useAuthContext>);

    render(<ExhibitorOnboardingPage />);

    const shell = screen.getByRole('status', { name: 'Loading onboarding' });
    expect(shell.className).toContain('pt-[calc(var(--app-header-height,3rem)+1rem)]');
    // `p-4` padded the top by a flat 1rem, which is what put it behind the header.
    expect(shell.className).not.toMatch(/\bp-4\b/);
  });
});
