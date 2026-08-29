import { describe, expect, it } from 'vitest';
import { countLabel, pluralize } from '../pluralize';

describe('pluralize', () => {
  it('uses the singular for exactly one', () => {
    expect(pluralize(1, 'class', 'classes')).toBe('class');
  });

  it('uses the plural for zero and for many', () => {
    expect(pluralize(0, 'class', 'classes')).toBe('classes');
    expect(pluralize(2, 'class', 'classes')).toBe('classes');
  });

  it('defaults the plural to singular + s', () => {
    expect(pluralize(2, 'trial')).toBe('trials');
    expect(pluralize(1, 'trial')).toBe('trial');
  });

  it('countLabel prefixes the count', () => {
    // The F9 case: the Detective element offers a single class.
    expect(countLabel(1, 'class', 'classes')).toBe('1 class');
    expect(countLabel(4, 'class', 'classes')).toBe('4 classes');
  });
});
