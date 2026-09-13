import { describe, expect, it } from 'vitest';
import { buildClassDisambiguator, classNameExtra } from '../classLabel';

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

/**
 * The collision gate. Applying `classNameExtra` unconditionally rewrote 14 of
 * 24 class labels in the live database and 13 were harmful — this project's
 * class names carry load-test and issue-ticket naming. These pin that the gate
 * stays shut for everything except a genuine twin.
 */
describe('buildClassDisambiguator', () => {
  it('returns nothing for a class with no twin, however odd its name', () => {
    const disambiguate = buildClassDisambiguator([
      { name: 'Load 2 Class 1', element: 'Container', level: 'Advanced', section: null },
      { name: 'Container Novice', element: 'Container', level: 'Novice', section: null },
    ]);

    // The exact regression the gate exists to prevent: a load-test fixture
    // name published to an exhibitor as "Advanced Load 2 Class 1".
    expect(
      disambiguate({
        name: 'Load 2 Class 1',
        element: 'Container',
        level: 'Advanced',
        section: null,
      })
    ).toBe('');
  });

  it('returns the distinguishing words when two classes would render alike', () => {
    const disambiguate = buildClassDisambiguator([
      { name: 'Interior Advanced', element: 'Interior', level: 'Advanced', section: null },
      {
        name: 'Interior Advanced Preliminary',
        element: 'Interior',
        level: 'Advanced',
        section: null,
      },
    ]);

    expect(
      disambiguate({
        name: 'Interior Advanced',
        element: 'Interior',
        level: 'Advanced',
        section: null,
      })
    ).toBe('');
    expect(
      disambiguate({
        name: 'Interior Advanced Preliminary',
        element: 'Interior',
        level: 'Advanced',
        section: null,
      })
    ).toBe('Preliminary');
  });

  it('does not treat classes sharing a key AND a name as a collision', () => {
    // Four seeded "Interior Novice A" rows share everything. They are the
    // ordinary split-level case, not an ambiguity to resolve.
    const rows = Array.from({ length: 4 }, () => ({
      name: 'Interior Novice A',
      element: 'Interior',
      level: 'Novice',
      section: 'A',
    }));
    const disambiguate = buildClassDisambiguator(rows);

    expect(disambiguate(rows[0]!)).toBe('');
  });

  it('separates classes by section, so Novice A and Novice B are not twins', () => {
    const disambiguate = buildClassDisambiguator([
      { name: 'Interior Novice A', element: 'Interior', level: 'Novice', section: 'A' },
      { name: 'Interior Novice B', element: 'Interior', level: 'Novice', section: 'B' },
    ]);

    expect(
      disambiguate({
        name: 'Interior Novice B',
        element: 'Interior',
        level: 'Novice',
        section: 'B',
      })
    ).toBe('');
  });
});
