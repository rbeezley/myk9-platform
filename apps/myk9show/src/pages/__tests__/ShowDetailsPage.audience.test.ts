import { describe, it, expect } from 'vitest';
import { resolveShowAudience, type ShowAudienceInput } from '../ShowDetailsPage.audience';

// Baseline: an anonymous visitor on the canonical /shows/:id route with no
// entries. Each test overrides only the fields it exercises.
function input(overrides: Partial<ShowAudienceInput> = {}): ShowAudienceInput {
  return {
    isManagementSection: false,
    isSecretary: false,
    isAdmin: false,
    isClubAdmin: false,
    isAuthenticated: false,
    userEntriesLoading: false,
    hasUserEntries: false,
    ...overrides,
  };
}

describe('resolveShowAudience', () => {
  it('an anonymous visitor with no entries sees the public landing', () => {
    expect(resolveShowAudience(input())).toBe('public');
  });

  it('a secretary sees the management shell', () => {
    expect(resolveShowAudience(input({ isSecretary: true }))).toBe('management');
  });

  it('public preview forces the public landing on the canonical route', () => {
    expect(resolveShowAudience(input({ isSecretary: true, forcePublicPreview: true }))).toBe(
      'public'
    );
  });

  it('an admin sees the management shell', () => {
    expect(resolveShowAudience(input({ isAdmin: true }))).toBe('management');
  });

  it('a club admin sees the exhibitor view, not management or public', () => {
    // club_admin is staff enough to skip the public landing, but is NOT
    // canManageShow — so it lands on the exhibitor view.
    expect(resolveShowAudience(input({ isClubAdmin: true }))).toBe('exhibitor');
  });

  it('an entered exhibitor (authenticated, has entries) sees the exhibitor view', () => {
    expect(resolveShowAudience(input({ isAuthenticated: true, hasUserEntries: true }))).toBe(
      'exhibitor'
    );
  });

  it('an authenticated visitor with entries still loading is held as pending', () => {
    expect(resolveShowAudience(input({ isAuthenticated: true, userEntriesLoading: true }))).toBe(
      'pending'
    );
  });

  it('does NOT hold an anonymous visitor as pending even while loading', () => {
    // The pending hold only applies to authenticated visitors — an anon user
    // has no entries to wait for, so they go straight to the public landing.
    expect(resolveShowAudience(input({ userEntriesLoading: true }))).toBe('public');
  });

  it('a staff user is never held pending (skips the landing gate entirely)', () => {
    expect(
      resolveShowAudience(
        input({ isSecretary: true, isAuthenticated: true, userEntriesLoading: true })
      )
    ).toBe('management');
  });

  it('a management-section URL skips the public landing for a non-staff visitor', () => {
    // Direct navigation to /shows/:id/<section> reaches the tabbed UI even for a
    // non-staff, no-entries visitor (the section route guards itself).
    expect(resolveShowAudience(input({ isManagementSection: true }))).toBe('exhibitor');
  });

  it('a management-section URL for a secretary resolves to management', () => {
    expect(resolveShowAudience(input({ isManagementSection: true, isSecretary: true }))).toBe(
      'management'
    );
  });

  it('pending takes precedence over the public landing while entries load', () => {
    // hasUserEntries is false but still loading — we must not commit to 'public'
    // before the entries query settles, or an entered exhibitor flashes the landing.
    expect(
      resolveShowAudience(
        input({ isAuthenticated: true, userEntriesLoading: true, hasUserEntries: false })
      )
    ).toBe('pending');
  });
});
