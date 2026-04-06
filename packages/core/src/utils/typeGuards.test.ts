import { describe, it, expect } from 'vitest';
import {
  isDefined,
  assertDefined,
  isObject,
  hasProperty,
  isString,
  isNumber,
  isBoolean,
  isArray,
  isArrayOf,
  isFunction,
  isDate,
  isPromise,
  isNullish,
  hasRequiredProperties,
  safeGet,
  assert,
  assertNever,
} from './typeGuards';

describe('isDefined', () => {
  it('returns true for non-null, non-undefined values', () => {
    expect(isDefined('hello')).toBe(true);
    expect(isDefined(0)).toBe(true);
    expect(isDefined(false)).toBe(true);
    expect(isDefined({})).toBe(true);
    expect(isDefined([])).toBe(true);
  });

  it('returns false for null', () => {
    expect(isDefined(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isDefined(undefined)).toBe(false);
  });
});

describe('assertDefined', () => {
  it('does not throw for a defined value', () => {
    expect(() => assertDefined('value', 'should not throw')).not.toThrow();
  });

  it('throws for null with the provided message', () => {
    expect(() => assertDefined(null, 'missing value')).toThrow('missing value');
  });

  it('throws for undefined with the provided message', () => {
    expect(() => assertDefined(undefined, 'missing value')).toThrow('missing value');
  });
});

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

describe('hasProperty', () => {
  it('returns true when object has the key', () => {
    expect(hasProperty({ id: 1 }, 'id')).toBe(true);
  });

  it('returns false when object lacks the key', () => {
    expect(hasProperty({ id: 1 }, 'name')).toBe(false);
  });

  it('returns false for non-objects', () => {
    expect(hasProperty(null, 'id')).toBe(false);
    expect(hasProperty('string', 'length')).toBe(false);
  });
});

describe('isString', () => {
  it('returns true for strings', () => {
    expect(isString('')).toBe(true);
    expect(isString('hello')).toBe(true);
  });

  it('returns false for non-strings', () => {
    expect(isString(42)).toBe(false);
    expect(isString(null)).toBe(false);
    expect(isString(undefined)).toBe(false);
    expect(isString({})).toBe(false);
  });
});

describe('isNumber', () => {
  it('returns true for numbers', () => {
    expect(isNumber(0)).toBe(true);
    expect(isNumber(3.14)).toBe(true);
    expect(isNumber(-5)).toBe(true);
  });

  it('returns false for NaN', () => {
    expect(isNumber(NaN)).toBe(false);
  });

  it('returns false for non-numbers', () => {
    expect(isNumber('42')).toBe(false);
    expect(isNumber(null)).toBe(false);
    expect(isNumber(undefined)).toBe(false);
  });
});

describe('isBoolean', () => {
  it('returns true for booleans', () => {
    expect(isBoolean(true)).toBe(true);
    expect(isBoolean(false)).toBe(true);
  });

  it('returns false for non-booleans', () => {
    expect(isBoolean(1)).toBe(false);
    expect(isBoolean('true')).toBe(false);
    expect(isBoolean(null)).toBe(false);
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

describe('isArrayOf', () => {
  it('returns true for an array where all items match the guard', () => {
    expect(isArrayOf(['a', 'b'], isString)).toBe(true);
    expect(isArrayOf([], isString)).toBe(true);
  });

  it('returns false when some items do not match', () => {
    expect(isArrayOf(['a', 1], isString)).toBe(false);
  });

  it('returns false for non-arrays', () => {
    expect(isArrayOf('not-array', isString)).toBe(false);
  });
});

describe('isFunction', () => {
  it('returns true for functions', () => {
    expect(isFunction(() => {})).toBe(true);
    expect(isFunction(function named() {})).toBe(true);
  });

  it('returns false for non-functions', () => {
    expect(isFunction(null)).toBe(false);
    expect(isFunction({})).toBe(false);
    expect(isFunction('fn')).toBe(false);
  });
});

describe('isDate', () => {
  it('returns true for valid Date instances', () => {
    expect(isDate(new Date())).toBe(true);
    expect(isDate(new Date('2024-01-01'))).toBe(true);
  });

  it('returns false for invalid Date instances', () => {
    expect(isDate(new Date('invalid'))).toBe(false);
  });

  it('returns false for non-Date values', () => {
    expect(isDate('2024-01-01')).toBe(false);
    expect(isDate(null)).toBe(false);
    expect(isDate({})).toBe(false);
  });
});

describe('isPromise', () => {
  it('returns true for native Promises', () => {
    expect(isPromise(Promise.resolve())).toBe(true);
  });

  it('returns true for promise-like objects', () => {
    expect(isPromise({ then: () => {}, catch: () => {} })).toBe(true);
  });

  it('returns false for non-promises', () => {
    expect(isPromise(null)).toBe(false);
    expect(isPromise({})).toBe(false);
    expect(isPromise({ then: 'not-a-fn' })).toBe(false);
  });
});

describe('isNullish', () => {
  it('returns true for null', () => {
    expect(isNullish(null)).toBe(true);
  });

  it('returns true for undefined', () => {
    expect(isNullish(undefined)).toBe(true);
  });

  it('returns false for defined values', () => {
    expect(isNullish(0)).toBe(false);
    expect(isNullish('')).toBe(false);
    expect(isNullish(false)).toBe(false);
  });
});

describe('hasRequiredProperties', () => {
  it('returns true when all keys are present', () => {
    expect(hasRequiredProperties({ id: 1, name: 'test' }, ['id', 'name'])).toBe(true);
  });

  it('returns false when a key is missing', () => {
    expect(hasRequiredProperties({ id: 1 }, ['id', 'name'])).toBe(false);
  });

  it('returns false for non-objects', () => {
    expect(hasRequiredProperties(null, ['id'])).toBe(false);
    expect(hasRequiredProperties('string', ['length'])).toBe(false);
  });

  it('returns true for empty keys array', () => {
    expect(hasRequiredProperties({}, [])).toBe(true);
  });
});

describe('safeGet', () => {
  it('returns the value for an existing key', () => {
    expect(safeGet({ id: 42 }, 'id')).toBe(42);
  });

  it('returns undefined for a missing key', () => {
    expect(safeGet({}, 'missing')).toBeUndefined();
  });

  it('returns undefined for non-objects', () => {
    expect(safeGet(null, 'id')).toBeUndefined();
    expect(safeGet('string', 'length')).toBeUndefined();
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
