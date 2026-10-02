import { describe, expect, it } from 'vitest';
import { UserRole } from '@/types/auth-types';
import { canDeletePerson } from './personDeleteGate';

// The gate is exactly soft_delete_person's rule (MYK9-934): a site admin, or the person's own
// account. Show staff never see Delete on a person.
describe('canDeletePerson', () => {
  // Real shapes: people.id and the mapped auth uid are different uuids (people.id is never an
  // auth uid), and the viewer's `id` is the viewer's auth uid.
  const PERSON_ID = '6f1c2a3b-0d4e-4f5a-8b6c-7d8e9f0a1b2c';
  const PERSON_AUTH_UID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
  const OTHER_AUTH_UID = 'f0e1d2c3-b4a5-4968-8776-655443322110';
  const person = { id: PERSON_ID, user_id: PERSON_AUTH_UID };
  const viewer = (roles: UserRole[], authId = OTHER_AUTH_UID) => ({ id: authId, roles });

  it.each([
    ['a site admin', [UserRole.SITE_ADMIN], OTHER_AUTH_UID, true],
    ['the person themselves, an exhibitor', [UserRole.EXHIBITOR], PERSON_AUTH_UID, true],
    ['the person themselves, a secretary', [UserRole.SECRETARY], PERSON_AUTH_UID, true],
    ['a secretary', [UserRole.SECRETARY], OTHER_AUTH_UID, false],
    ['a club admin', [UserRole.CLUB_ADMIN], OTHER_AUTH_UID, false],
    [
      'a secretary who is also a club admin',
      [UserRole.SECRETARY, UserRole.CLUB_ADMIN],
      OTHER_AUTH_UID,
      false,
    ],
    ['another exhibitor', [UserRole.EXHIBITOR], OTHER_AUTH_UID, false],
    ['a judge viewing someone else', [UserRole.JUDGE], OTHER_AUTH_UID, false],
    ['a steward viewing someone else', [UserRole.STEWARD], OTHER_AUTH_UID, false],
  ])('%s', (_label, roles, authId, expected) => {
    expect(canDeletePerson(person, viewer(roles, authId))).toBe(expected);
  });

  it('is false for a signed-out viewer', () => {
    expect(canDeletePerson(person, null)).toBe(false);
  });

  it('never matches self on people.id, which is not an auth uid', () => {
    // A viewer whose auth uid happens to equal the people.id is still not this person.
    expect(canDeletePerson(person, viewer([UserRole.EXHIBITOR], PERSON_ID))).toBe(false);
    expect(
      canDeletePerson(
        { id: PERSON_ID, user_id: undefined },
        viewer([UserRole.EXHIBITOR], PERSON_ID)
      )
    ).toBe(false);
  });
});
