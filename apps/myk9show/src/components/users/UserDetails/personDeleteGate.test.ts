import { describe, expect, it } from 'vitest';
import { UserRole } from '@/types/auth-types';
import { canDeletePerson } from './personDeleteGate';

// soft_delete_person (20261001235300) refuses everyone except:
//   is_site_admin() OR can_manage_show_person(person) OR the person's own account.
// The third-party clause is "manages a show this person has an entry in"; the client
// cannot see that cheaply, so staff who manage shows pass the gate and the dialog's
// server preview reports the rest as forbidden.
describe('canDeletePerson (mirrors soft_delete_person)', () => {
  const person = { id: 'p1', user_id: 'auth-1' };
  const viewer = (roles: UserRole[], authId = 'auth-9') => ({ id: authId, roles });

  it.each([
    ['a site admin', [UserRole.SITE_ADMIN], 'auth-9', true],
    ['a secretary', [UserRole.SECRETARY], 'auth-9', true],
    ['a club admin', [UserRole.CLUB_ADMIN], 'auth-9', true],
    ['the person themselves, an exhibitor', [UserRole.EXHIBITOR], 'auth-1', true],
    ['another exhibitor', [UserRole.EXHIBITOR], 'auth-9', false],
    ['a judge viewing someone else', [UserRole.JUDGE], 'auth-9', false],
    ['a steward viewing someone else', [UserRole.STEWARD], 'auth-9', false],
  ])('%s: %s', (_label, roles, authId, expected) => {
    expect(canDeletePerson(person, viewer(roles, authId))).toBe(expected);
  });

  it('is false for a signed-out viewer', () => {
    expect(canDeletePerson(person, null)).toBe(false);
  });

  it('never matches self on a contact with no account, even when ids look alike', () => {
    // A contact-only person has no auth account: person.id is a people.id, which is
    // never an auth uid, so it must not be compared with the viewer's auth id.
    expect(
      canDeletePerson({ id: 'auth-9', user_id: undefined }, viewer([UserRole.EXHIBITOR]))
    ).toBe(false);
  });
});
