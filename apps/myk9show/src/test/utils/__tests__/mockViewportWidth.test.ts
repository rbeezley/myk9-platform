import { describe, it, expect } from 'vitest';
import { mockViewportWidth } from '../mockViewportWidth';

const matches = (query: string) => window.matchMedia(query).matches;

describe('mockViewportWidth', () => {
  it('answers min-width and max-width terms against the width', () => {
    mockViewportWidth(800);
    expect(matches('(min-width: 1024px)')).toBe(false);
    expect(matches('(max-width: 1023px)')).toBe(true);

    mockViewportWidth(1280);
    expect(matches('(min-width: 1024px)')).toBe(true);
  });

  it('negates a "not all and" query, the exact complement of its terms', () => {
    mockViewportWidth(800);
    expect(matches('not all and (min-width: 1024px)')).toBe(true);

    mockViewportWidth(1024);
    expect(matches('not all and (min-width: 1024px)')).toBe(false);
  });
});
