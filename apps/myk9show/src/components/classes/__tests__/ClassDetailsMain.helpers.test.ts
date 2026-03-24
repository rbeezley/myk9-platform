import { describe, it, expect } from 'vitest';
import { shouldShowSection, formatClassTitle } from '../ClassDetailsMain.helpers';

describe('shouldShowSection', () => {
  it('returns true for Novice level with section', () => {
    expect(shouldShowSection({ element: 'Container', level: 'Novice', section: 'A' })).toBe(true);
    expect(shouldShowSection({ element: 'Interior', level: 'Novice', section: 'B' })).toBe(true);
  });

  it('returns true for Novice A/B variant levels', () => {
    expect(shouldShowSection({ element: 'Exterior', level: 'Novice A', section: 'A' })).toBe(true);
    expect(shouldShowSection({ element: 'Buried', level: 'Novice B', section: 'B' })).toBe(true);
  });

  it('returns false for Advanced level', () => {
    expect(shouldShowSection({ element: 'Container', level: 'Advanced', section: 'A' })).toBe(
      false
    );
  });

  it('returns false for Excellent level', () => {
    expect(shouldShowSection({ element: 'Interior', level: 'Excellent', section: 'A' })).toBe(
      false
    );
  });

  it('returns false for Master level', () => {
    expect(shouldShowSection({ element: 'Exterior', level: 'Master', section: 'A' })).toBe(false);
  });

  it('returns false for Masters level', () => {
    expect(shouldShowSection({ element: 'Buried', level: 'Masters', section: 'A' })).toBe(false);
  });

  it('returns false for Detective element regardless of other fields', () => {
    expect(shouldShowSection({ element: 'Detective', section: 'A' })).toBe(false);
    expect(shouldShowSection({ element: 'Detective', level: 'Novice', section: 'A' })).toBe(false);
  });

  it('returns false when section is empty or missing', () => {
    expect(shouldShowSection({ element: 'Container', level: 'Novice' })).toBe(false);
    expect(shouldShowSection({ element: 'Container', level: 'Novice', section: '' })).toBe(false);
    expect(shouldShowSection({ element: 'Container', level: 'Novice', section: undefined })).toBe(
      false
    );
  });

  it('returns false when level is missing', () => {
    expect(shouldShowSection({ element: 'Container', section: 'A' })).toBe(false);
  });
});

describe('formatClassTitle', () => {
  it('includes section for Novice level', () => {
    expect(
      formatClassTitle({
        id: '1',
        trialId: 't1',
        trial: 'T1',
        trialDate: '2026-01-01',
        trialNumber: '1',
        classOrder: '1',
        status: 'Scheduled',
        judge: 'J',
        element: 'Container',
        level: 'Novice',
        section: 'A',
      })
    ).toBe('Container Novice A');
  });

  it('excludes section for non-Novice level', () => {
    expect(
      formatClassTitle({
        id: '1',
        trialId: 't1',
        trial: 'T1',
        trialDate: '2026-01-01',
        trialNumber: '1',
        classOrder: '1',
        status: 'Scheduled',
        judge: 'J',
        element: 'Container',
        level: 'Advanced',
        section: 'A',
      })
    ).toBe('Container Advanced');
  });

  it('excludes section for Detective element', () => {
    expect(
      formatClassTitle({
        id: '1',
        trialId: 't1',
        trial: 'T1',
        trialDate: '2026-01-01',
        trialNumber: '1',
        classOrder: '1',
        status: 'Scheduled',
        judge: 'J',
        element: 'Detective',
        section: 'A',
      })
    ).toBe('Detective');
  });
});
