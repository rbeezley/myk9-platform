import { buildDisplayLabel } from '@/components/shows/RegistrationWorkflow/ClassSelectionStep.helpers';
import { buildClassDisambiguator } from '@/features/_shared/classLabel';

describe('buildDisplayLabel', () => {
  it('returns "level section" when both are present', () => {
    expect(buildDisplayLabel('Novice', 'A')).toBe('Novice A');
  });

  it('returns level alone when section is undefined', () => {
    expect(buildDisplayLabel('Advanced', undefined)).toBe('Advanced');
  });

  it('returns level alone when section is empty string', () => {
    expect(buildDisplayLabel('Advanced', '')).toBe('Advanced');
  });

  it('returns undefined when level is empty', () => {
    expect(buildDisplayLabel('', undefined)).toBeUndefined();
  });

  it('returns undefined when level is empty but section exists', () => {
    expect(buildDisplayLabel('', 'A')).toBeUndefined();
  });

  it('returns undefined for "Unknown" level (Detective-style classes)', () => {
    expect(buildDisplayLabel('Unknown', 'A')).toBeUndefined();
    expect(buildDisplayLabel('Unknown', undefined)).toBeUndefined();
  });

  it('handles UKC Nose Work pattern — section at every level', () => {
    expect(buildDisplayLabel('Novice', 'A')).toBe('Novice A');
    expect(buildDisplayLabel('Novice', 'B')).toBe('Novice B');
    expect(buildDisplayLabel('Open', 'A')).toBe('Open A');
    expect(buildDisplayLabel('Open', 'B')).toBe('Open B');
    expect(buildDisplayLabel('Elite', 'A')).toBe('Elite A');
    expect(buildDisplayLabel('Elite', 'B')).toBe('Elite B');
  });
  /**
   * MYK9-489. The Heartland Saturday trial runs two Interior/Advanced classes,
   * neither with a section: "Interior Advanced" and "Interior Advanced
   * Preliminary". Built from level + section alone they render as two adjacent
   * chips both reading "Advanced", so the exhibitor picking "the Advanced one"
   * has even odds of entering the wrong class at $30 a go.
   */
  it('distinguishes two classes that share a level and have no section', () => {
    const disambiguate = buildClassDisambiguator([
      { name: 'Interior Advanced', element: 'Interior', level: 'Advanced', section: null },
      {
        name: 'Interior Advanced Preliminary',
        element: 'Interior',
        level: 'Advanced',
        section: null,
      },
    ]);
    const a = buildDisplayLabel(
      'Advanced',
      undefined,
      disambiguate({ name: 'Interior Advanced', element: 'Interior', level: 'Advanced' })
    );
    const b = buildDisplayLabel(
      'Advanced',
      undefined,
      disambiguate({
        name: 'Interior Advanced Preliminary',
        element: 'Interior',
        level: 'Advanced',
      })
    );

    expect(a).toBe('Advanced');
    expect(b).toBe('Advanced Preliminary');
    expect(a).not.toBe(b);
  });

  it('adds nothing when the name only restates element, level and section', () => {
    // The common case, and the reason the extra words must be derived rather
    // than the name simply rendered: "Interior Novice B" would otherwise read
    // back its own element and double its level and section.
    const disambiguate = buildClassDisambiguator([
      { name: 'Interior Novice A', element: 'Interior', level: 'Novice', section: 'A' },
      { name: 'Interior Novice B', element: 'Interior', level: 'Novice', section: 'B' },
    ]);
    expect(
      buildDisplayLabel(
        'Novice',
        'B',
        disambiguate({
          name: 'Interior Novice B',
          element: 'Interior',
          level: 'Novice',
          section: 'B',
        })
      )
    ).toBe('Novice B');
  });

  it('still returns undefined for a level-less class even when extra words exist', () => {
    // Detective-style classes have no real level; nothing the disambiguator
    // produces should resurrect a label for them.
    expect(buildDisplayLabel('Unknown', undefined, 'Element Search')).toBeUndefined();
    expect(buildDisplayLabel('', 'A', 'Element Search')).toBeUndefined();
  });
});
