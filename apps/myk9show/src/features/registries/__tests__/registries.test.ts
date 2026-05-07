import { describe, it, expect } from 'vitest';
import { getRegistry, getSport, listRegistries, akcRegistry } from '../index';

describe('registry config layer', () => {
  it('lists all configured registry ids', () => {
    expect(listRegistries()).toEqual(['AKC']);
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

  it('AKC scent-work sport has the canonical levels and elements', () => {
    const sport = getSport(akcRegistry, 'scent-work');
    expect(sport.levels).toEqual(['Novice', 'Advanced', 'Excellent', 'Master']);
    expect(sport.elements).toEqual(['Container', 'Interior', 'Exterior', 'Buried']);
    expect(sport.special).toEqual(['Handler Discrimination', 'Detective']);
  });

  it('getSport throws loudly for an unconfigured sport', () => {
    expect(() => getSport(akcRegistry, 'agility')).toThrow(/sport.*agility.*registry.*AKC/i);
  });
});
