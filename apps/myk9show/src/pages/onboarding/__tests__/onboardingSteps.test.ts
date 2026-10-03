import { describe, expect, it } from 'vitest';
import { UserRole } from '@/types/auth-types';
import {
  buildOnboardingSteps,
  getOnboardingDestination,
  pendingRoleSteps,
  type OnboardingState,
} from '../onboardingSteps';

const firstRun = (roles: UserRole[], overrides: Partial<OnboardingState> = {}) =>
  buildOnboardingSteps({
    hasProfile: true,
    baseCompleted: false,
    roles,
    onboardedRoles: [],
    ...overrides,
  });

describe('buildOnboardingSteps', () => {
  it('gives an exhibitor dogs then welcome when signup already made the profile', () => {
    expect(firstRun([UserRole.EXHIBITOR])).toEqual(['dogs', 'welcome']);
  });

  it('starts at profile only when no profile row exists', () => {
    expect(firstRun([UserRole.EXHIBITOR], { hasProfile: false })).toEqual([
      'profile',
      'dogs',
      'welcome',
    ]);
  });

  it('adds one step per role held, in a fixed order, between dogs and welcome', () => {
    expect(
      firstRun([UserRole.CLUB_ADMIN, UserRole.JUDGE, UserRole.SECRETARY, UserRole.EXHIBITOR])
    ).toEqual(['dogs', 'secretary', 'judge', 'club_admin', 'welcome']);
  });

  it('gives a site admin profile and dogs but no role step', () => {
    expect(firstRun([UserRole.SITE_ADMIN], { hasProfile: false })).toEqual([
      'profile',
      'dogs',
      'welcome',
    ]);
  });

  it('gives chairman and steward no role step', () => {
    expect(firstRun([UserRole.CHAIRMAN, UserRole.STEWARD])).toEqual(['dogs', 'welcome']);
  });

  it('is done for an onboarded exhibitor', () => {
    expect(firstRun([UserRole.EXHIBITOR], { baseCompleted: true })).toEqual([]);
  });

  it('never queues a later role step on its own: the banner offers it instead', () => {
    expect(
      firstRun([UserRole.SECRETARY, UserRole.JUDGE, UserRole.EXHIBITOR], {
        baseCompleted: true,
        onboardedRoles: ['judge'],
      })
    ).toEqual([]);
  });

  it('runs ONLY the requested new role step after onboarding', () => {
    const state: OnboardingState = {
      hasProfile: true,
      baseCompleted: true,
      roles: [UserRole.SECRETARY, UserRole.JUDGE, UserRole.CLUB_ADMIN],
      onboardedRoles: ['judge'],
    };
    expect(buildOnboardingSteps(state, 'secretary')).toEqual(['secretary']);
    // Already done, revoked, or not a role step: nothing to run.
    expect(buildOnboardingSteps(state, 'judge')).toEqual([]);
    expect(buildOnboardingSteps({ ...state, roles: [UserRole.JUDGE] }, 'secretary')).toEqual([]);
    expect(buildOnboardingSteps(state, 'dogs')).toEqual([]);
  });

  it('runs a role step once: recorded roles never come back', () => {
    expect(
      firstRun([UserRole.SECRETARY, UserRole.JUDGE], {
        baseCompleted: true,
        onboardedRoles: ['secretary', 'judge'],
      })
    ).toEqual([]);
  });

  it('never invents role steps when onboarded_roles is unknown (column not returned)', () => {
    expect(firstRun([UserRole.SECRETARY], { baseCompleted: true, onboardedRoles: null })).toEqual(
      []
    );
    expect(firstRun([UserRole.SECRETARY], { onboardedRoles: null })).toEqual(['dogs', 'welcome']);
  });

  it('skips a role step already recorded even on a first run', () => {
    expect(firstRun([UserRole.JUDGE], { onboardedRoles: ['judge'] })).toEqual(['dogs', 'welcome']);
  });
});

describe('pendingRoleSteps', () => {
  it('ignores recorded roles the person no longer holds', () => {
    expect(pendingRoleSteps([UserRole.EXHIBITOR], ['secretary'])).toEqual([]);
  });
});

describe('getOnboardingDestination', () => {
  it('sends exhibitors to Find Shows', () => {
    expect(getOnboardingDestination([UserRole.EXHIBITOR])).toBe('/shows');
    expect(getOnboardingDestination([UserRole.STEWARD])).toBe('/shows');
  });

  it("sends staff to their main role's home page", () => {
    expect(getOnboardingDestination([UserRole.EXHIBITOR, UserRole.SECRETARY])).toBe(
      '/secretary/dashboard'
    );
    expect(getOnboardingDestination([UserRole.JUDGE])).toBe('/judge/dashboard');
    expect(getOnboardingDestination([UserRole.CLUB_ADMIN])).toBe('/club-admin/members');
    expect(getOnboardingDestination([UserRole.SITE_ADMIN, UserRole.JUDGE])).toBe(
      '/admin/dashboard'
    );
  });
});
