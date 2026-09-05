import { describe, expect, it } from 'vitest';
import { isValidUUID } from './validation';

describe('isValidUUID', () => {
  it('accepts deterministic UUID-shaped database identifiers', () => {
    expect(isValidUUID('a1090000-0000-0000-0010-100000000001')).toBe(true);
  });

  it('accepts standard UUIDs', () => {
    expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });

  it('rejects malformed identifiers', () => {
    expect(isValidUUID('not-a-uuid')).toBe(false);
    expect(isValidUUID('a1090000-0000-0000-0010-10000000000')).toBe(false);
  });
});
