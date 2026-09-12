import { describe, it, expect } from 'vitest';
import { resolveShowAudience, type ShowAudienceInput } from '../ShowDetailsPage.audience';

// Baseline: an anonymous visitor on the canonical /shows/:id route with no
// entries. Each test overrides only the fields it exercises.
function input(overrides: Partial<ShowAudienceInput> = {}): ShowAudienceInput {
  return {
    isManagementSection: false,
    canManageShow: false,
    isManagementStaff: false,
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
    expect(resolveShowAudience(input({ canManageShow: true, isManagementStaff: true }))).toBe(
      'management'
    );
  });

  it('public preview forces the public landing on the canonical route', () => {
    expect(
      resolveShowAudience(
        input({ forcePublicPreview: true, canManageShow: true, isManagementStaff: true })
      )
    ).toBe('public');
  });

  it('an admin sees the management shell', () => {
    expect(resolveShowAudience(input({ canManageShow: true, isManagementStaff: true }))).toBe(
      'management'
    );
  });

  it('does not expose management shell to a secretary outside their club', () => {
    expect(resolveShowAudience(input({ isAuthenticated: true, hasUserEntries: true }))).toBe(
      'exhibitor'
    );
  });

  it('a club admin sees the exhibitor view, not management or public', () => {
    expect(resolveShowAudience(input({ canManageShow: true, isManagementStaff: false }))).toBe(
      'exhibitor'
    );
  });

  it('holds a signed-in staff viewer while RBAC resolves', () => {
    expect(
      resolveShowAudience(
        input({ isAuthenticated: true, rbacLoading: true, hasUserEntries: false })
      )
    ).toBe('pending');
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
        input({
          canManageShow: true,
          isManagementStaff: true,
          isAuthenticated: true,
          userEntriesLoading: true,
        })
      )
    ).toBe('management');
  });

  it('a management-section URL skips the public landing for a non-staff visitor', () => {
    // Direct navigation to /shows/:id/<section> reaches the tabbed UI even for a
    // non-staff, no-entries visitor (the section route guards itself).
    expect(resolveShowAudience(input({ isManagementSection: true }))).toBe('exhibitor');
  });

  it('a management-section URL for a secretary resolves to management', () => {
    expect(
      resolveShowAudience(
        input({ isManagementSection: true, canManageShow: true, isManagementStaff: true })
      )
    ).toBe('management');
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
