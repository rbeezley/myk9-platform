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
  it('shows a skeleton while authenticated exhibitor context is still loading', () => {
    mockUseAuthContext.mockReturnValue({
      user: { id: 'auth-user-id' } as User,
      userWithRoles: null,
      loading: true,
      rbacLoading: true,
    } as ReturnType<typeof useAuthContext>);

    render(<ExhibitorOnboardingPage />);

    expect(
      screen.getByRole('status', { name: 'Loading exhibitor onboarding' })
    ).toBeInTheDocument();
    expect(document.querySelector('.animate-spin')).toBeNull();
  });

  it('redirects secretary users to the secretary dashboard instead of rendering exhibitor onboarding', async () => {
    setupAuth([UserRole.SECRETARY]);

    render(<ExhibitorOnboardingPage />);

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/secretary/dashboard', { replace: true });
    });
    expect(screen.queryByText('Tell us about yourself')).not.toBeInTheDocument();
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
});
