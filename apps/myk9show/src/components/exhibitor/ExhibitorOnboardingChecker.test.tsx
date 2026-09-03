/**
 * Regression guard for the onboarding redirect vs. anonymous (passcode ringside)
 * sessions.
 *
 * Anonymous users have no exhibitor_profiles row by design (migration
 * 20260625000000), so `needsOnboarding` is true for them. Routing them to
 * exhibitor onboarding bounced passcode judges/stewards out of /at-show (caught
 * live on staging). The checker must exempt anonymous users while still
 * redirecting a real profile-less account.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { ExhibitorOnboardingChecker } from './ExhibitorOnboardingChecker';

const navigateSpy = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateSpy,
  useLocation: () => ({ pathname: '/at-show/show-1' }),
}));

let authValue: {
  user: { id: string; is_anonymous?: boolean } | null;
  loading: boolean;
  isSecretary: boolean;
  hasRole: (r: string) => boolean;
};
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => authValue,
}));

let profileValue: {
  needsOnboarding: boolean;
  onboardingCompleted: boolean;
  profileSettled: boolean;
  isLoading: boolean;
  error: Error | null;
};
vi.mock('@/hooks/useExhibitorProfile', () => ({
  useExhibitorProfile: () => profileValue,
}));

const renderChecker = () =>
  render(
    <ExhibitorOnboardingChecker>
      <div>child</div>
    </ExhibitorOnboardingChecker>
  );

describe('ExhibitorOnboardingChecker — anonymous exemption', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authValue = { user: { id: 'u1' }, loading: false, isSecretary: false, hasRole: () => false };
    profileValue = {
      needsOnboarding: true,
      onboardingCompleted: false,
      profileSettled: true,
      isLoading: false,
      error: null,
    };
  });

  it('does NOT redirect an anonymous (passcode ringside) user, even with needsOnboarding', () => {
    authValue.user = { id: 'anon-1', is_anonymous: true };
    renderChecker();
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('DOES redirect a real profile-less account to onboarding (regression guard)', () => {
    authValue.user = { id: 'u1', is_anonymous: false };
    renderChecker();
    expect(navigateSpy).toHaveBeenCalledWith('/onboarding', { replace: true });
  });

  it('does not redirect when there is no user', () => {
    authValue.user = null;
    renderChecker();
    expect(navigateSpy).not.toHaveBeenCalled();
  });
});
