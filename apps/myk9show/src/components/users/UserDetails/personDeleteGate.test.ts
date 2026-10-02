import { describe, expect, it } from 'vitest';
import { UserRole } from '@/types/auth-types';
import { personDeleteGate } from './personDeleteGate';

// soft_delete_person (20261001235300) refuses everyone except:
//   is_site_admin() OR can_manage_show_person(person) OR the person's own account.
// Show staff get 'ask-server': the third-party clause depends on entries the client lacks.
describe('personDeleteGate (mirrors soft_delete_person)', () => {
  const person = { id: 'p1', user_id: 'auth-1' };
  const viewer = (roles: UserRole[], authId = 'auth-9') => ({ id: authId, roles });

  it.each([
    ['a site admin', [UserRole.SITE_ADMIN], 'auth-9', 'allowed'],
    ['the person themselves, an exhibitor', [UserRole.EXHIBITOR], 'auth-1', 'allowed'],
    ['a secretary', [UserRole.SECRETARY], 'auth-9', 'ask-server'],
    ['a club admin', [UserRole.CLUB_ADMIN], 'auth-9', 'ask-server'],
    ['another exhibitor', [UserRole.EXHIBITOR], 'auth-9', 'denied'],
    ['a judge viewing someone else', [UserRole.JUDGE], 'auth-9', 'denied'],
    ['a steward viewing someone else', [UserRole.STEWARD], 'auth-9', 'denied'],
  ])('%s', (_label, roles, authId, expected) => {
    expect(personDeleteGate(person, viewer(roles, authId))).toBe(expected);
  });

  it('is denied for a signed-out viewer', () => {
    expect(personDeleteGate(person, null)).toBe('denied');
  });

  it('never matches self on a contact with no account, even when ids look alike', () => {
    expect(
      personDeleteGate({ id: 'auth-9', user_id: undefined }, viewer([UserRole.EXHIBITOR]))
    ).toBe('denied');
  });
});
