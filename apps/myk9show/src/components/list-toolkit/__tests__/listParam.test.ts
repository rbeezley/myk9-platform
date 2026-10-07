import { describe, expect, it } from 'vitest';
import { parseListParam, serializeListParam } from '../listParam';

describe('parseListParam', () => {
  it('reads a single value written before multi-select as a list of one', () => {
    expect(parseListParam('7f3c')).toEqual(['7f3c']);
  });

  it('reads a comma list in order', () => {
    expect(parseListParam('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('treats a missing or empty param as an empty list', () => {
    expect(parseListParam(null)).toEqual([]);
    expect(parseListParam('')).toEqual([]);
  });

  it('drops blanks and repeats', () => {
    expect(parseListParam('a,,b, ,a')).toEqual(['a', 'b']);
  });
});

describe('serializeListParam', () => {
  it('returns null for an empty list so the param is deleted', () => {
    expect(serializeListParam([])).toBeNull();
    expect(serializeListParam([''])).toBeNull();
  });

  it('writes one value without a comma', () => {
    expect(serializeListParam(['a'])).toBe('a');
  });

  it('joins several values and drops repeats', () => {
    expect(serializeListParam(['a', 'b', 'a'])).toBe('a,b');
  });

  it.each([['a,b'], ['100%'], ['x%2Cy'], ['plain']])('round-trips %s', value => {
    expect(parseListParam(serializeListParam([value, 'z']))).toEqual([value, 'z']);
  });
});
