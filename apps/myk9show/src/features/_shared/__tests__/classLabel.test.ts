import { describe, expect, it } from 'vitest';
import {
  buildClassDisambiguator,
  buildClassDisambiguatorsByGroup,
  buildFullClassLabel,
  buildTrialDayDisambiguator,
  buildTrialDisambiguators,
  classNameExtra,
} from '../classLabel';

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

// MYK9-805 (Codex review on PR #2548): a collision is a question about
// classes offered in the SAME trial, never the whole show.
describe('buildTrialDisambiguators', () => {
  it('disambiguates within a trial that has a real collision', () => {
    const byTrialId = buildTrialDisambiguators(
      [
        { trialId: 'trial-1', name: 'Interior Advanced', element: 'Interior', level: 'Advanced' },
        {
          trialId: 'trial-1',
          name: 'Interior Advanced Preliminary',
          element: 'Interior',
          level: 'Advanced',
        },
      ],
      new Set(['trial-1'])
    );

    expect(
      byTrialId.get('trial-1')?.({
        name: 'Interior Advanced Preliminary',
        element: 'Interior',
        level: 'Advanced',
      })
    ).toBe('Preliminary');
  });

  it('never lets a collision in one trial add a suffix in a different trial', () => {
    // Same element/level/section pair, but each trial only ever offers ONE
    // of the two names — no exhibitor in either trial can confuse them.
    const byTrialId = buildTrialDisambiguators(
      [
        { trialId: 'trial-1', name: 'Interior Advanced', element: 'Interior', level: 'Advanced' },
        {
          trialId: 'trial-2',
          name: 'Interior Advanced Preliminary',
          element: 'Interior',
          level: 'Advanced',
        },
      ],
      new Set(['trial-1', 'trial-2'])
    );

    expect(
      byTrialId.get('trial-1')?.({
        name: 'Interior Advanced',
        element: 'Interior',
        level: 'Advanced',
      })
    ).toBe('');
    expect(
      byTrialId.get('trial-2')?.({
        name: 'Interior Advanced Preliminary',
        element: 'Interior',
        level: 'Advanced',
      })
    ).toBe('');
  });

  it('does not mask a real within-trial collision behind a third trial sharing the identity', () => {
    // trial-1 genuinely collides (two names); trial-2 merely shares the same
    // element/level with a THIRD name. Grouping every trial together would
    // make trial-1's key see 3 distinct names and still disambiguate
    // correctly here, but must not do so by accident — each trial's group is
    // built from ONLY its own classes.
    const byTrialId = buildTrialDisambiguators(
      [
        { trialId: 'trial-1', name: 'Interior Advanced', element: 'Interior', level: 'Advanced' },
        {
          trialId: 'trial-1',
          name: 'Interior Advanced Preliminary',
          element: 'Interior',
          level: 'Advanced',
        },
        {
          trialId: 'trial-2',
          name: 'Interior Advanced Excellent',
          element: 'Interior',
          level: 'Advanced',
        },
      ],
      new Set(['trial-1', 'trial-2'])
    );

    expect(
      byTrialId.get('trial-1')?.({
        name: 'Interior Advanced Preliminary',
        element: 'Interior',
        level: 'Advanced',
      })
    ).toBe('Preliminary');
    // trial-2's only class has nothing in its OWN trial to collide with.
    expect(
      byTrialId.get('trial-2')?.({
        name: 'Interior Advanced Excellent',
        element: 'Interior',
        level: 'Advanced',
      })
    ).toBe('');
  });
});

/**
 * MYK9-825: a UKC show splits every level into A/B, giving 20 Vehicle classes
 * across 2 trials. A stored class name that omits the section (created
 * outside `generateScentWorkClasses`) must not collapse "Vehicle Novice A"
 * and "Vehicle Novice B" into the same label.
 */
describe('buildFullClassLabel', () => {
  it('composes element, level and section, ignoring a section-less stored name', () => {
    expect(
      buildFullClassLabel(
        { element: 'Vehicle', level: 'Novice', section: 'A' },
        '',
        'Vehicle Novice'
      )
    ).toBe('Vehicle Novice A');
    expect(
      buildFullClassLabel(
        { element: 'Vehicle', level: 'Novice', section: 'B' },
        '',
        'Vehicle Novice'
      )
    ).toBe('Vehicle Novice B');
  });

  it('appends the disambiguator extra when the caller supplies one', () => {
    expect(
      buildFullClassLabel(
        { element: 'Container', level: 'Advanced', section: null },
        'Preliminary',
        'Container Advanced Preliminary'
      )
    ).toBe('Container Advanced Preliminary');
  });

  it('falls back to the stored name only when element and level are both unresolvable', () => {
    expect(buildFullClassLabel({}, '', 'Handler Discrimination')).toBe('Handler Discrimination');
    expect(buildFullClassLabel({}, '', null)).toBe('Class');
  });
});

describe('buildClassDisambiguatorsByGroup', () => {
  it('scopes the collision test to each class own group, not across groups', () => {
    const trial1 = {
      trialId: 't1',
      name: 'Interior Advanced',
      element: 'Interior',
      level: 'Advanced',
      section: null,
    };
    const trial2 = {
      trialId: 't2',
      name: 'Interior Advanced Preliminary',
      element: 'Interior',
      level: 'Advanced',
      section: null,
    };
    const lookup = buildClassDisambiguatorsByGroup([trial1, trial2], cls => cls.trialId);

    // Each trial has only ONE "Interior Advanced"-shaped class, so within its
    // own group there is no collision even though the two groups together
    // would look identical to `buildClassDisambiguator` run over both at once.
    expect(lookup('t1')(trial1)).toBe('');
    expect(lookup('t2')(trial2)).toBe('');
  });

  it('returns a no-op disambiguator for an unknown group key', () => {
    const lookup = buildClassDisambiguatorsByGroup([], () => 'x');
    expect(lookup('missing')({ name: 'Anything', element: 'E', level: 'L', section: null })).toBe(
      ''
    );
  });
});

/**
 * MYK9-832 #10: a two-trial Saturday show entering a dog in both trials'
 * "Vehicle Novice B" showed the identical row twice, told apart only by a day
 * label ("Sat ·") that read the same for both trials.
 */
describe('buildTrialDayDisambiguator', () => {
  it('returns the trial name when two trials share a date', () => {
    const disambiguate = buildTrialDayDisambiguator([
      { trialId: 'trial-1', trialDate: '2026-10-10', trialName: 'Saturday Trial 1' },
      { trialId: 'trial-2', trialDate: '2026-10-10', trialName: 'Saturday Trial 2' },
    ]);

    expect(disambiguate('trial-1')).toBe('Saturday Trial 1');
    expect(disambiguate('trial-2')).toBe('Saturday Trial 2');
  });

  it('returns nothing for the ordinary one-trial-per-day case', () => {
    const disambiguate = buildTrialDayDisambiguator([
      { trialId: 'trial-1', trialDate: '2026-10-10', trialName: 'Saturday Trial 1' },
      { trialId: 'trial-2', trialDate: '2026-10-11', trialName: 'Sunday Trial 1' },
    ]);

    expect(disambiguate('trial-1')).toBe('');
    expect(disambiguate('trial-2')).toBe('');
  });

  it('returns nothing for a trial with no date on record', () => {
    const disambiguate = buildTrialDayDisambiguator([
      { trialId: 'trial-1', trialDate: null, trialName: 'Trial 1' },
      { trialId: 'trial-2', trialDate: null, trialName: 'Trial 2' },
    ]);

    expect(disambiguate('trial-1')).toBe('');
  });

  it('returns nothing for a trial id absent from the set', () => {
    const disambiguate = buildTrialDayDisambiguator([
      { trialId: 'trial-1', trialDate: '2026-10-10', trialName: 'Saturday Trial 1' },
    ]);

    expect(disambiguate('unknown-trial')).toBe('');
  });
});
