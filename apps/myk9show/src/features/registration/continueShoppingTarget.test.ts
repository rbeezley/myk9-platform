import { describe, it, expect } from 'vitest';
import { continueShoppingTarget } from './continueShoppingTarget';

describe('continueShoppingTarget', () => {
  it('sends the exhibitor to the wizard for the cart’s show, not the show page', () => {
    // MYK9-509: the show page has no path back into a half-finished entry.
    expect(continueShoppingTarget('show-1')).toBe('/shows/show-1/register');
  });

  it('falls back to browsing shows when there is no cart show', () => {
    expect(continueShoppingTarget(null)).toBe('/shows');
    expect(continueShoppingTarget(undefined)).toBe('/shows');
    expect(continueShoppingTarget('')).toBe('/shows');
  });
});
