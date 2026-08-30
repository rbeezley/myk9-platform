/**
 * F24 — the Communication History filter listed other clubs' show names, because it was
 * built from the global show store (which holds every show loaded for public browsing).
 *
 * These pin the client predicate against the SERVER policy it mirrors
 * (`threads_select` on `show_message_threads`). Getting it merely "close" is not
 * harmless in either direction: too wide re-lists other clubs' shows and subscribes to
 * threads the server will never return; too narrow hides a show the secretary really
 * does manage.
 */
import { describe, expect, it } from 'vitest';
import { ScopeType, UserRole, type UserWithRoles } from '@/types/auth-types';
import { canReadShowMessages, selectMessageShows } from '../messageShowScope';

const CLUB_A = 'club-a';
const CLUB_B = 'club-b';

const showA = { id: 'show-a', clubId: CLUB_A };
const showB = { id: 'show-b', clubId: CLUB_B };

function user(scopes: UserWithRoles['scopes']): UserWithRoles {
  return { scopes } as UserWithRoles;
}

function roles(...held: UserRole[]) {
  return (role: UserRole) => held.includes(role);
}

const secretaryOfA = user([
  { scopeType: ScopeType.CLUB, scopeId: CLUB_A, roleId: UserRole.SECRETARY },
] as UserWithRoles['scopes']);

describe('canReadShowMessages', () => {
  it('allows a club-scoped secretary on their own club’s show', () => {
    expect(canReadShowMessages(secretaryOfA, roles(UserRole.SECRETARY), showA)).toBe(true);
  });

  it('denies that same secretary another club’s show', () => {
    // The finding: MYK9-109 Load Shows 1–3 appeared for a Heartland-only secretary.
    expect(canReadShowMessages(secretaryOfA, roles(UserRole.SECRETARY), showB)).toBe(false);
  });

  it('denies a GLOBAL secretary with no club scope', () => {
    // `hasRole(SECRETARY)` means "a secretary somewhere". The server asks
    // `is_trial_secretary(s.club_id)`, which needs a role row for THAT club — a row
    // with a null club_id matches no specific club.
    expect(canReadShowMessages(user([]), roles(UserRole.SECRETARY), showA)).toBe(false);
  });

  it('allows a club-scoped club admin', () => {
    const clubAdmin = user([
      { scopeType: ScopeType.CLUB, scopeId: CLUB_A, roleId: UserRole.CLUB_ADMIN },
    ] as UserWithRoles['scopes']);
    expect(canReadShowMessages(clubAdmin, roles(UserRole.CLUB_ADMIN), showA)).toBe(true);
    expect(canReadShowMessages(clubAdmin, roles(UserRole.CLUB_ADMIN), showB)).toBe(false);
  });

  it('allows a site admin anywhere', () => {
    expect(canReadShowMessages(user([]), roles(UserRole.SITE_ADMIN), showB)).toBe(true);
  });

  it.each([UserRole.CHAIRMAN, UserRole.STEWARD, UserRole.JUDGE])(
    'denies %s, who has ringside access but no message grant',
    role => {
      // Reusing the ringside staff predicate here would list shows whose threads the
      // server never returns — a filter option that is permanently, unexplainably empty.
      const staff = user([
        { scopeType: ScopeType.CLUB, scopeId: CLUB_A, roleId: role },
      ] as UserWithRoles['scopes']);
      expect(canReadShowMessages(staff, roles(role), showA)).toBe(false);
    }
  );

  it('denies a SHOW-scoped secretary grant', () => {
    // `is_trial_secretary` requires `ur.show_id IS NULL`, so a show-level grant confers
    // no message access however plausible it looks.
    const showScoped = user([
      { scopeType: ScopeType.SHOW, scopeId: showA.id, roleId: UserRole.SECRETARY },
    ] as UserWithRoles['scopes']);
    expect(canReadShowMessages(showScoped, roles(UserRole.SECRETARY), showA)).toBe(false);
  });

  it('denies a show with no club', () => {
    expect(canReadShowMessages(secretaryOfA, roles(UserRole.SECRETARY), { id: 'orphan' })).toBe(
      false
    );
  });
});

describe('selectMessageShows', () => {
  it('keeps only the readable shows, preserving order', () => {
    const result = selectMessageShows(
      [showB, showA, { id: 'show-c', clubId: CLUB_B }],
      secretaryOfA,
      roles(UserRole.SECRETARY)
    );
    expect(result.map(s => s.id)).toEqual(['show-a']);
  });

  it('tolerates a missing list', () => {
    expect(selectMessageShows(undefined, secretaryOfA, roles(UserRole.SECRETARY))).toEqual([]);
  });

  it('returns nothing for a viewer holding no relevant scope', () => {
    expect(selectMessageShows([showA, showB], user([]), roles(UserRole.EXHIBITOR))).toEqual([]);
  });
});
