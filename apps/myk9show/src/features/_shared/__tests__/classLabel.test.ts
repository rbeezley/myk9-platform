import { describe, expect, it } from 'vitest';
import { classNameExtra } from '../classLabel';

/**
 * The rule both the show premium and the registration wizard build their class
 * labels from. Shapes below are the real seeded Heartland ones — the show that
 * exposed MYK9-487 and MYK9-489 by running two Interior/Advanced classes.
 */
describe('classNameExtra', () => {
  it('returns the words a name adds beyond element, level and section', () => {
    expect(classNameExtra('Interior Advanced Preliminary', 'Interior', 'Advanced', null)).toBe(
      'Preliminary'
    );
  });

  it('returns nothing when the name only restates what the caller already renders', () => {
    // Load-bearing: this emptiness is what keeps split levels merged on the
    // premium and stops ordinary chips doubling their own words.
    expect(classNameExtra('Interior Advanced', 'Interior', 'Advanced', null)).toBe('');
    expect(classNameExtra('Interior Novice B', 'Interior', 'Novice', 'B')).toBe('');
  });

  it('returns nothing when there is no name to read', () => {
    expect(classNameExtra(null, 'Interior', 'Advanced', null)).toBe('');
    expect(classNameExtra(undefined, 'Interior', 'Advanced', null)).toBe('');
    expect(classNameExtra('   ', 'Interior', 'Advanced', null)).toBe('');
  });

  it('ignores case when matching the tokens it strips', () => {
    expect(classNameExtra('INTERIOR advanced Preliminary', 'Interior', 'Advanced', null)).toBe(
      'Preliminary'
    );
  });

  it('matches whole words only, so a token inside a longer word survives', () => {
    // "Novice" must not be stripped out of "Novices"; the extra words are what
    // distinguish two classes, so over-stripping re-creates the original bug.
    expect(classNameExtra('Interior Novices Cup', 'Interior', 'Novice', null)).toBe('Novices Cup');
  });

  it('strips each token once, so a repeated level keeps its second occurrence', () => {
    expect(classNameExtra('Interior Advanced Advanced', 'Interior', 'Advanced', null)).toBe(
      'Advanced'
    );
  });

  it('treats regex metacharacters in a token as literal text', () => {
    // Element and level are free text from the database. An unescaped token
    // would either throw or silently match the wrong thing.
    expect(classNameExtra('C.A.T. Open Trial', 'C.A.T.', 'Open', null)).toBe('Trial');
    expect(classNameExtra('Element (A) Novice Cup', 'Element (A)', 'Novice', null)).toBe('Cup');
  });

  it('keeps the whole name when nothing matches', () => {
    expect(classNameExtra('Handler Discrimination', 'Vehicle', 'Elite', null)).toBe(
      'Handler Discrimination'
    );
  });
});
