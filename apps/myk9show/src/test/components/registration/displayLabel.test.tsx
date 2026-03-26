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

  it('handles UKC Nose Work pattern — section at every level', () => {
    expect(buildDisplayLabel('Novice', 'A')).toBe('Novice A');
    expect(buildDisplayLabel('Novice', 'B')).toBe('Novice B');
    expect(buildDisplayLabel('Open', 'A')).toBe('Open A');
    expect(buildDisplayLabel('Open', 'B')).toBe('Open B');
    expect(buildDisplayLabel('Elite', 'A')).toBe('Elite A');
    expect(buildDisplayLabel('Elite', 'B')).toBe('Elite B');
  });
});
