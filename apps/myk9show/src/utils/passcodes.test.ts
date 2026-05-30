import { describe, it, expect } from 'vitest';
import { generatePasscodesFromShowId, getExhibitorLoginUrl } from './passcodes';

const TEST_UUID = '63165809-e025-25c6-6cf9-979f63165809';

describe('generatePasscodesFromShowId', () => {
  it('derives four passcodes from a valid UUID', () => {
    expect(generatePasscodesFromShowId(TEST_UUID)).toEqual({
      admin: 'ae025',
      judge: 'j25c6',
      steward: 's6cf9',
      exhibitor: 'e979f',
    });
  });

  it('returns null for a string with fewer than 5 segments', () => {
    expect(generatePasscodesFromShowId('myK9Q1-d8609f3b-d3fd43aa-6323a604')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(generatePasscodesFromShowId('')).toBeNull();
  });

  it('returns null for a plain string with no hyphens', () => {
    expect(generatePasscodesFromShowId('notauuid')).toBeNull();
  });
});

describe('getExhibitorLoginUrl', () => {
  it('returns the pre-filled show-access URL', () => {
    expect(getExhibitorLoginUrl(TEST_UUID)).toBe('https://myk9show.com/at-show?code=e979f');
  });

  it('returns an empty string for an invalid showId', () => {
    expect(getExhibitorLoginUrl('bad-id')).toBe('');
  });
});
