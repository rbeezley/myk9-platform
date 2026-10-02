import { describe, expect, it } from 'vitest';
import { UserRole } from '@/types/auth-types';
import { canDeletePerson } from './personDeleteGate';

// Static gate, deliberately a little wider than soft_delete_person for show staff (see the
// gate's header); the dialog's refusal copy covers a stranger.
describe('canDeletePerson', () => {
  const person = { id: 'p1', user_id: 'auth-1' };
  const viewer = (roles: UserRole[], authId = 'auth-9') => ({ id: authId, roles });

  it.each([
    ['a site admin', [UserRole.SITE_ADMIN], 'auth-9', true],
    ['the person themselves, an exhibitor', [UserRole.EXHIBITOR], 'auth-1', true],
    ['a secretary', [UserRole.SECRETARY], 'auth-9', true],
    ['a club admin', [UserRole.CLUB_ADMIN], 'auth-9', true],
    ['another exhibitor', [UserRole.EXHIBITOR], 'auth-9', false],
    ['a judge viewing someone else', [UserRole.JUDGE], 'auth-9', false],
    ['a steward viewing someone else', [UserRole.STEWARD], 'auth-9', false],
  ])('%s', (_label, roles, authId, expected) => {
    expect(canDeletePerson(person, viewer(roles, authId))).toBe(expected);
  });

  it('is false for a signed-out viewer', () => {
    expect(canDeletePerson(person, null)).toBe(false);
  });

  it('never matches self on a contact with no account, even when ids look alike', () => {
    expect(
      canDeletePerson({ id: 'auth-9', user_id: undefined }, viewer([UserRole.EXHIBITOR]))
    ).toBe(false);
  });
});
