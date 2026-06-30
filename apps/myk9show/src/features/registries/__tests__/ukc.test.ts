import { describe, it, expect } from 'vitest';
import { getRegistry } from '../index';
import { generateScentWorkClasses, getScentWorkSport } from '../scentWork';
import { UKC_EXHIBITOR_AGREEMENT } from '../ukc';

/**
 * Phase 3: UKC Nosework registry config. Pins identity/legal and the generated class catalog
 * (from the registry structure) so the publishing surfaces — already wired to read the registry
 * in Phases 0–2 — render UKC correctly.
 */
describe('UKC registry — identity & legal', () => {
  const ukc = getRegistry('UKC');

  it('has the expected identity strings', () => {
    expect(ukc.name).toBe('United Kennel Club');
    expect(ukc.shortName).toBe('UKC');
    expect(ukc.licenseLanguage).toBe('A UKC Licensed Nosework Trial');
    expect(ukc.registrationField.label).toBe('UKC registration number');
  });

  it('uses host-club footer framing (not "member club")', () => {
    expect(ukc.memberClubLanguage).toBe(
      'Held under the Official Rules and Regulations of the United Kennel Club'
    );
    expect(ukc.memberClubLanguage).not.toMatch(/member club/i);
  });

  it('exhibitor agreement is the UKC waiver with the Nosework rule-set + host-club indemnity', () => {
    expect(ukc.exhibitorAgreement).toBe(UKC_EXHIBITOR_AGREEMENT);
    expect(UKC_EXHIBITOR_AGREEMENT.split('\n\n')).toHaveLength(3);
    expect(UKC_EXHIBITOR_AGREEMENT).toMatch(/indemnify and hold UKC, the host club/);
    expect(UKC_EXHIBITOR_AGREEMENT).toMatch(/Official UKC Rules and Regulations \(Nosework\)/);
  });
});

describe('UKC Nosework — generated class catalog', () => {
  const classes = generateScentWorkClasses(getScentWorkSport('UKC'));
  const names = classes.map(c => c.className);

  it('produces 48 classes (4 grid elements × 5 levels × A/B + HD × 4 × A/B)', () => {
    expect(classes).toHaveLength(48);
  });

  it('includes Vehicle and excludes AKC-only Buried/Detective', () => {
    expect(classes.some(c => c.element === 'Vehicle')).toBe(true);
    expect(classes.some(c => c.element === 'Buried')).toBe(false);
    expect(classes.some(c => c.element === 'Detective')).toBe(false);
  });

  it('splits every level A/B for a grid element (Superior, Master, Elite included)', () => {
    expect(names).toEqual(
      expect.arrayContaining([
        'Container Novice A',
        'Container Novice B',
        'Container Superior A',
        'Container Superior B',
        'Container Master A',
        'Container Elite A',
        'Container Elite B',
      ])
    );
    // No un-sectioned base classes (A/B are ownership variants → replace the base).
    expect(names).not.toContain('Container Novice');
    expect(names).not.toContain('Container Elite');
  });

  it('HD uses "Excellent" at rank 3 (not Superior) and has no Elite', () => {
    const hd = classes.filter(c => c.element === 'Handler Discrimination');
    expect(hd).toHaveLength(8); // 4 levels × A/B
    expect(hd.map(c => c.className)).toEqual(
      expect.arrayContaining(['Handler Discrimination Excellent A', 'Handler Discrimination Excellent B'])
    );
    expect(hd.some(c => c.level === 'Superior')).toBe(false);
    expect(hd.some(c => c.level === 'Elite')).toBe(false);
  });
});
