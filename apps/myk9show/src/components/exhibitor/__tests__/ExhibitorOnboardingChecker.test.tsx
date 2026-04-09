import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { ExhibitorOnboardingChecker } from '../ExhibitorOnboardingChecker';

// Mock hooks
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: vi.fn(),
}));

vi.mock('@/hooks/useExhibitorProfile', () => ({
  useExhibitorProfile: vi.fn(),
}));

// Capture navigate calls
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({ pathname: '/exhibitor/dashboard' }),
  };
});

import { useAuthContext } from '@/hooks/useAuthContext';
import { useExhibitorProfile } from '@/hooks/useExhibitorProfile';

const mockUseAuthContext = useAuthContext as ReturnType<typeof vi.fn>;
const mockUseExhibitorProfile = useExhibitorProfile as ReturnType<typeof vi.fn>;

function setupMocks({
  user = { id: 'u1', email: 'a@b.com' },
  authLoading = false,
  profileLoading = false,
  needsOnboarding = false,
  onboardingCompleted = true,
} = {}) {
  mockUseAuthContext.mockReturnValue({ user, loading: authLoading });
  mockUseExhibitorProfile.mockReturnValue({
    needsOnboarding,
    onboardingCompleted,
    isLoading: profileLoading,
  });
}

describe('ExhibitorOnboardingChecker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders children when profile exists and onboarding is complete', () => {
    setupMocks({ needsOnboarding: false, onboardingCompleted: true });
    render(
      <ExhibitorOnboardingChecker>
        <div>Dashboard content</div>
      </ExhibitorOnboardingChecker>
    );
    expect(screen.getByText('Dashboard content')).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('redirects to /onboarding when needsOnboarding is true', () => {
    setupMocks({ needsOnboarding: true, onboardingCompleted: false });
    render(
      <ExhibitorOnboardingChecker>
        <div>Dashboard content</div>
      </ExhibitorOnboardingChecker>
    );
    expect(mockNavigate).toHaveBeenCalledWith('/onboarding', { replace: true });
  });

  it('does not redirect when profile exists but onboarding not completed (omitted until migration 125)', () => {
    setupMocks({ needsOnboarding: false, onboardingCompleted: false });
    render(
      <ExhibitorOnboardingChecker>
        <div>Dashboard content</div>
      </ExhibitorOnboardingChecker>
    );
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('does not redirect when user is not authenticated', () => {
    setupMocks({ user: null, needsOnboarding: false, onboardingCompleted: false });
    render(
      <ExhibitorOnboardingChecker>
        <div>Public content</div>
      </ExhibitorOnboardingChecker>
    );
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('does not redirect while auth is loading', () => {
    setupMocks({ authLoading: true, needsOnboarding: true, onboardingCompleted: false });
    render(
      <ExhibitorOnboardingChecker>
        <div>Loading state</div>
      </ExhibitorOnboardingChecker>
    );
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('does not redirect while profile is loading', () => {
    setupMocks({ profileLoading: true, needsOnboarding: false, onboardingCompleted: false });
    render(
      <ExhibitorOnboardingChecker>
        <div>Loading state</div>
      </ExhibitorOnboardingChecker>
    );
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
