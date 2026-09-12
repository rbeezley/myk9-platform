import { buildDisplayLabel } from '@/components/shows/RegistrationWorkflow/ClassSelectionStep.helpers';

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
    const a = buildDisplayLabel('Advanced', undefined, {
      name: 'Interior Advanced',
      element: 'Interior',
    });
    const b = buildDisplayLabel('Advanced', undefined, {
      name: 'Interior Advanced Preliminary',
      element: 'Interior',
    });

    expect(a).toBe('Advanced');
    expect(b).toBe('Advanced Preliminary');
    expect(a).not.toBe(b);
  });

  it('adds nothing when the name only restates element, level and section', () => {
    // The common case, and the reason the extra words must be derived rather
    // than the name simply rendered: "Interior Novice B" would otherwise read
    // back its own element and double its level and section.
    expect(
      buildDisplayLabel('Novice', 'B', { name: 'Interior Novice B', element: 'Interior' })
    ).toBe('Novice B');
  });

  it('still returns undefined for a level-less class even when a name is given', () => {
    expect(
      buildDisplayLabel('Unknown', undefined, {
        name: 'Detective Element Search',
        element: 'Detective',
      })
    ).toBeUndefined();
  });
});
