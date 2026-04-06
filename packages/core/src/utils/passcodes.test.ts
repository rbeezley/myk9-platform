import { describe, it, expect } from 'vitest';
import { generatePasscodesFromShowId } from './passcodes';

describe('generatePasscodesFromShowId', () => {
  const validUuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

  it('generates correct passcodes from a valid UUID', () => {
    const result = generatePasscodesFromShowId(validUuid);
    expect(result).toEqual({
      admin: 'ae5f6',
      judge: 'j7890',
      steward: 'sabcd',
      exhibitor: 'eef12',
    });
  });

  it('returns null for a string with no hyphens', () => {
    expect(generatePasscodesFromShowId('notauuid')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(generatePasscodesFromShowId('')).toBeNull();
  });

  it('returns null when segments are missing', () => {
    expect(generatePasscodesFromShowId('a1b2c3d4-e5f6')).toBeNull();
  });

  it('uses only the first 4 chars of segment 4 for the exhibitor code', () => {
    const result = generatePasscodesFromShowId(validUuid);
    expect(result?.exhibitor).toBe('eef12');
    expect(result?.exhibitor).toHaveLength(5); // 'e' prefix + 4 chars
  });

  it('prefixes each code with the correct role letter', () => {
    const result = generatePasscodesFromShowId(validUuid);
    expect(result?.admin.startsWith('a')).toBe(true);
    expect(result?.judge.startsWith('j')).toBe(true);
    expect(result?.steward.startsWith('s')).toBe(true);
    expect(result?.exhibitor.startsWith('e')).toBe(true);
  });
});
