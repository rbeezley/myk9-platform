import { describe, it, expect } from 'vitest';
import {
  AKC_SCENT_WORK_CLASS_NAMES,
  AKC_SCENT_WORK_SUMMARY,
  AKC_SCENT_WORK_TEMPLATE,
} from '../akcScentWorkTemplate';

/**
 * The reference exports are derived from the generated catalog (Phase 2b) so they can't drift.
 * These tests pin the corrected values (was 27 / 6-per-standard-element on main).
 */
describe('AKC scent-work reference exports (derived)', () => {
  it('class-name list mirrors the template classDefinitions in canonical order', () => {
    expect(AKC_SCENT_WORK_CLASS_NAMES).toEqual(
      AKC_SCENT_WORK_TEMPLATE.classDefinitions.map(c => c.className)
    );
    expect(AKC_SCENT_WORK_CLASS_NAMES[0]).toBe('Container Novice A');
    expect(AKC_SCENT_WORK_CLASS_NAMES).toHaveLength(26);
  });

  it('summary reports 26 classes with 5 per standard element', () => {
    expect(AKC_SCENT_WORK_SUMMARY.totalClasses).toBe(26);
    expect(AKC_SCENT_WORK_SUMMARY.elements).toEqual({
      Container: 5,
      Interior: 5,
      Exterior: 5,
      Buried: 5,
      'Handler Discrimination': 5,
      Detective: 1,
    });
    expect(AKC_SCENT_WORK_SUMMARY.levels).toEqual({
      'Novice A': 5,
      'Novice B': 5,
      Advanced: 5,
      Excellent: 5,
      Master: 5,
      'None (Detective)': 1,
    });
  });
});
