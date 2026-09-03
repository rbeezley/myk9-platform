import { describe, it, expect } from 'vitest';
import { isObject, isArray, assert, assertNever } from './typeGuards';

describe('isObject', () => {
  it('returns true for plain objects', () => {
    expect(isObject({})).toBe(true);
    expect(isObject({ a: 1 })).toBe(true);
  });

  it('returns false for null', () => {
    expect(isObject(null)).toBe(false);
  });

  it('returns false for arrays', () => {
    expect(isObject([])).toBe(false);
  });

  it('returns false for primitives', () => {
    expect(isObject('string')).toBe(false);
    expect(isObject(42)).toBe(false);
    expect(isObject(true)).toBe(false);
  });
});

describe('isArray', () => {
  it('returns true for arrays', () => {
    expect(isArray([])).toBe(true);
    expect(isArray([1, 2, 3])).toBe(true);
  });

  it('returns false for non-arrays', () => {
    expect(isArray({})).toBe(false);
    expect(isArray('string')).toBe(false);
    expect(isArray(null)).toBe(false);
  });
});

describe('assert', () => {
  it('does not throw when condition is true', () => {
    expect(() => assert(true, 'should not throw')).not.toThrow();
  });

  it('throws with the provided message when condition is false', () => {
    expect(() => assert(false, 'must be truthy')).toThrow('Assertion failed: must be truthy');
  });
});

describe('assertNever', () => {
  it('throws with a JSON representation of the unexpected value', () => {
    expect(() => assertNever('unexpected' as never)).toThrow('Unexpected value: "unexpected"');
  });
});
