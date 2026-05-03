import { describe, it, expect } from 'vitest';
import { resolveSecretaryCc } from '../ccSecretary';

describe('resolveSecretaryCc', () => {
  it('returns secretary email when toggle is true and email is set', () => {
    expect(resolveSecretaryCc(true, 'sec@example.com')).toEqual(['sec@example.com']);
  });

  it('returns empty array when toggle is false, even if email is set', () => {
    expect(resolveSecretaryCc(false, 'sec@example.com')).toEqual([]);
  });

  it('returns empty array when secretary email is null', () => {
    expect(resolveSecretaryCc(true, null)).toEqual([]);
  });

  it('returns empty array when secretary email is undefined', () => {
    expect(resolveSecretaryCc(true, undefined)).toEqual([]);
  });

  it('returns empty array when secretary email is empty string', () => {
    expect(resolveSecretaryCc(true, '')).toEqual([]);
  });

  it('defaults toggle to true when null (pre-migration row)', () => {
    expect(resolveSecretaryCc(null, 'sec@example.com')).toEqual(['sec@example.com']);
  });

  it('defaults toggle to true when undefined (pre-migration row)', () => {
    expect(resolveSecretaryCc(undefined, 'sec@example.com')).toEqual(['sec@example.com']);
  });

  it('returns empty array when toggle is null and no email', () => {
    expect(resolveSecretaryCc(null, null)).toEqual([]);
  });
});
