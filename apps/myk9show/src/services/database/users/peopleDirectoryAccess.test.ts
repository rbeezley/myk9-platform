import { describe, it, expect } from 'vitest';
import { UserRole } from '@/types/auth-types';
import {
  shouldLoadPeopleDirectory,
  shouldPurgePersistedPeople,
  PEOPLE_DIRECTORY_ROLES,
} from './peopleDirectoryAccess';

describe('shouldLoadPeopleDirectory (SA-008 fetch gate)', () => {
  it('returns false for a plain exhibitor session (no people fetch at login)', () => {
    expect(shouldLoadPeopleDirectory([UserRole.EXHIBITOR])).toBe(false);
  });

  it('returns false for judge/steward-only sessions (they score via ringside, not userStore)', () => {
    expect(shouldLoadPeopleDirectory([UserRole.JUDGE])).toBe(false);
    expect(shouldLoadPeopleDirectory([UserRole.STEWARD])).toBe(false);
    expect(shouldLoadPeopleDirectory([UserRole.JUDGE, UserRole.EXHIBITOR])).toBe(false);
  });

  it('returns false for empty / null / undefined roles', () => {
    expect(shouldLoadPeopleDirectory([])).toBe(false);
    expect(shouldLoadPeopleDirectory(null)).toBe(false);
    expect(shouldLoadPeopleDirectory(undefined)).toBe(false);
  });

  it('returns true for each management role that renders a people directory', () => {
    expect(shouldLoadPeopleDirectory([UserRole.SITE_ADMIN])).toBe(true);
    expect(shouldLoadPeopleDirectory([UserRole.SECRETARY])).toBe(true);
    expect(shouldLoadPeopleDirectory([UserRole.CLUB_ADMIN])).toBe(true);
    expect(shouldLoadPeopleDirectory([UserRole.CHAIRMAN])).toBe(true);
  });

  it('returns true for a mixed exhibitor+secretary session (management role wins)', () => {
    expect(
      shouldLoadPeopleDirectory([UserRole.EXHIBITOR, UserRole.SECRETARY])
    ).toBe(true);
  });

  it('accepts raw role strings (roles arrive as string enum values)', () => {
    expect(shouldLoadPeopleDirectory(['secretary'])).toBe(true);
    expect(shouldLoadPeopleDirectory(['exhibitor'])).toBe(false);
  });

  it('PEOPLE_DIRECTORY_ROLES excludes exhibitor/judge/steward', () => {
    expect(PEOPLE_DIRECTORY_ROLES).not.toContain(UserRole.EXHIBITOR);
    expect(PEOPLE_DIRECTORY_ROLES).not.toContain(UserRole.JUDGE);
    expect(PEOPLE_DIRECTORY_ROLES).not.toContain(UserRole.STEWARD);
  });
});

describe('shouldPurgePersistedPeople (SA-008 persistence guard)', () => {
  it('purges when a non-management session has persisted people and roles resolved', () => {
    expect(
      shouldPurgePersistedPeople({
        rolesResolved: true,
        canLoadDirectory: false,
        hasPersistedPeople: true,
      })
    ).toBe(true);
  });

  it('does NOT purge while roles are still resolving (avoids clobbering RBAC window)', () => {
    expect(
      shouldPurgePersistedPeople({
        rolesResolved: false,
        canLoadDirectory: false,
        hasPersistedPeople: true,
      })
    ).toBe(false);
  });

  it('does NOT purge for a management session (it will load/keep the directory)', () => {
    expect(
      shouldPurgePersistedPeople({
        rolesResolved: true,
        canLoadDirectory: true,
        hasPersistedPeople: true,
      })
    ).toBe(false);
  });

  it('does NOT purge when nothing is persisted (no-op)', () => {
    expect(
      shouldPurgePersistedPeople({
        rolesResolved: true,
        canLoadDirectory: false,
        hasPersistedPeople: false,
      })
    ).toBe(false);
  });
});
