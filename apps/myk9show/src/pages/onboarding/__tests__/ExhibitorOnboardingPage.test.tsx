import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import { UserRole } from '@/types/auth-types';
import ExhibitorOnboardingPage from '../ExhibitorOnboardingPage';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useExhibitorProfile } from '@/hooks/useExhibitorProfile';

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

const mockUseAuthContext = vi.mocked(useAuthContext);
const mockUseExhibitorProfile = vi.mocked(useExhibitorProfile);

function setupAuth(roles: UserRole[]) {
  mockUseAuthContext.mockReturnValue({
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
  } as ReturnType<typeof useAuthContext>);
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
    createProfileAsync: vi.fn(),
    isCreatingProfile: false,
    completeOnboarding: vi.fn(),
    isCompletingOnboarding: false,
  } as unknown as ReturnType<typeof useExhibitorProfile>);
});

describe('ExhibitorOnboardingPage', () => {
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
