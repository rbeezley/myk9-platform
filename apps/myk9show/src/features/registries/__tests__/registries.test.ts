import { describe, it, expect } from 'vitest';
import { getRegistry, getSport, listRegistries, akcRegistry } from '../index';

describe('registry config layer', () => {
  it('lists all configured registry ids', () => {
    expect(listRegistries()).toEqual(['AKC', 'UKC']);
  });

  it('returns the AKC registry by id', () => {
    expect(getRegistry('AKC')).toBe(akcRegistry);
  });

  it('AKC has the expected identity strings', () => {
    const akc = getRegistry('AKC');
    expect(akc.name).toBe('American Kennel Club');
    expect(akc.shortName).toBe('A.K.C.');
    expect(akc.licenseLanguage).toBe('An A.K.C. Licensed Trial');
    expect(akc.memberClubLanguage).toBe('A member club of the American Kennel Club');
  });

  it('AKC scent-work sport preserves the canonical levels and elements (new shape)', () => {
    const sport = getSport(akcRegistry, 'scent-work');
    // Progression levels (excluding the Detective pseudo-level) match the original flat list.
    expect(sport.levels.filter(l => l.key !== 'detective').map(l => l.label)).toEqual([
      'Novice',
      'Advanced',
      'Excellent',
      'Master',
    ]);
    // Grid elements == the original `elements`; non-grid == the original `special`.
    expect(sport.elements.filter(e => e.grid).map(e => e.label)).toEqual([
      'Container',
      'Interior',
      'Exterior',
      'Buried',
    ]);
    expect(sport.elements.filter(e => !e.grid).map(e => e.label)).toEqual([
      'Handler Discrimination',
      'Detective',
    ]);
  });

  it('getSport throws loudly for an unconfigured sport', () => {
    expect(() => getSport(akcRegistry, 'agility')).toThrow(/sport.*agility.*registry.*AKC/i);
  });
});
