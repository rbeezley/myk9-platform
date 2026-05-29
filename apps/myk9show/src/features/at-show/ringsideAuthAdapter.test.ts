import { describe, it, expect } from 'vitest';
import { toRingsideRole, buildRingsideAuth } from './ringsideAuthAdapter';
import { UserRole as ShowRole } from '@/types/auth-types';
import type { RingsideShowContext } from '@myk9/ringside';

const showContext: RingsideShowContext = {
  showId: 'show-1',
  showName: 'Test Show',
  clubName: 'Test Club',
  showDate: '2026-06-01',
  licenseKey: 'abc',
  org: 'AKC Scent Work',
  competition_type: 'Regular',
};

describe('toRingsideRole', () => {
  it('maps show-running officials to admin', () => {
    expect(toRingsideRole(ShowRole.SITE_ADMIN)).toBe('admin');
    expect(toRingsideRole(ShowRole.SECRETARY)).toBe('admin');
    expect(toRingsideRole(ShowRole.CLUB_ADMIN)).toBe('admin');
    expect(toRingsideRole(ShowRole.CHAIRMAN)).toBe('admin');
  });

  it('maps judge/steward/exhibitor one-to-one', () => {
    expect(toRingsideRole(ShowRole.JUDGE)).toBe('judge');
    expect(toRingsideRole(ShowRole.STEWARD)).toBe('steward');
    expect(toRingsideRole(ShowRole.EXHIBITOR)).toBe('exhibitor');
  });

  it('returns null for an absent role', () => {
    expect(toRingsideRole(null)).toBeNull();
    expect(toRingsideRole(undefined)).toBeNull();
  });
});

describe('buildRingsideAuth', () => {
  it('exposes the mapped role and show context', () => {
    const auth = buildRingsideAuth({ showRole: ShowRole.JUDGE, showContext });
    expect(auth.role).toBe('judge');
    expect(auth.showContext).toBe(showContext);
  });

  it('derives canAccess from the mapped role (judge can score, cannot view passcodes)', () => {
    const auth = buildRingsideAuth({ showRole: ShowRole.JUDGE, showContext });
    expect(auth.canAccess('canScore')).toBe(true);
    expect(auth.canAccess('canViewPasscodes')).toBe(false);
  });

  it('admin (mapped from secretary) can manage classes and view passcodes', () => {
    const auth = buildRingsideAuth({ showRole: ShowRole.SECRETARY, showContext });
    expect(auth.canAccess('canManageClasses')).toBe(true);
    expect(auth.canAccess('canViewPasscodes')).toBe(true);
  });

  it('exhibitor can check in dogs but cannot score or change run order', () => {
    const auth = buildRingsideAuth({ showRole: ShowRole.EXHIBITOR, showContext });
    expect(auth.canAccess('canCheckInDogs')).toBe(true);
    expect(auth.canAccess('canScore')).toBe(false);
    expect(auth.canAccess('canChangeRunOrder')).toBe(false);
  });

  it('denies every permission when the role is unmapped/absent', () => {
    const auth = buildRingsideAuth({ showRole: null, showContext });
    expect(auth.role).toBeNull();
    expect(auth.canAccess('canCheckInDogs')).toBe(false);
    expect(auth.canAccess('canScore')).toBe(false);
  });
});
