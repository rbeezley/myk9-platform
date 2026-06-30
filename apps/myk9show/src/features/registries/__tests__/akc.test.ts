import { describe, it, expect } from 'vitest';
import { AKC_EXHIBITOR_AGREEMENT, akcRegistry } from '../akc';

/**
 * Phase 6: AKC's identity/legal strings (licenseLanguage, memberClubLanguage,
 * registrationField) had no source-text pin, unlike UKC's/ASCA's equivalent
 * "identity & legal" describe blocks — a silent typo in any of these would have
 * shipped unnoticed. Mirrors ukc.test.ts / asca.test.ts's identity coverage.
 */
describe('AKC registry — identity & legal', () => {
  it('has the expected identity strings', () => {
    expect(akcRegistry.name).toBe('American Kennel Club');
    expect(akcRegistry.shortName).toBe('A.K.C.');
    expect(akcRegistry.licenseLanguage).toBe('An A.K.C. Licensed Trial');
    expect(akcRegistry.memberClubLanguage).toBe('A member club of the American Kennel Club');
    expect(akcRegistry.registrationField.label).toBe('A.K.C. registration number');
  });
});

describe('AKC exhibitor agreement', () => {
  it('is exactly three paragraphs joined with double newlines', () => {
    const paragraphs = AKC_EXHIBITOR_AGREEMENT.split('\n\n');
    expect(paragraphs).toHaveLength(3);
    paragraphs.forEach(p => expect(p.length).toBeGreaterThan(100));
  });

  it('first paragraph opens with the certification clause', () => {
    expect(AKC_EXHIBITOR_AGREEMENT).toMatch(/^I certify that I am the actual owner of the dog/);
  });

  it('contains the indemnification clause', () => {
    expect(AKC_EXHIBITOR_AGREEMENT).toMatch(
      /indemnify, defend and save the aforementioned parties harmless/
    );
  });

  it('contains the AAA arbitration clause', () => {
    expect(AKC_EXHIBITOR_AGREEMENT).toMatch(/AMERICAN ARBITRATION ASSOCIATION/);
  });

  it('character length is in the expected range (guards against silent truncation)', () => {
    // Captured from extraction 2026-05-07: 3076 chars. Bounds allow ±5% drift before failing.
    expect(AKC_EXHIBITOR_AGREEMENT.length).toBeGreaterThan(2920);
    expect(AKC_EXHIBITOR_AGREEMENT.length).toBeLessThan(3232);
  });

  it('akcRegistry.exhibitorAgreement matches the exported constant', () => {
    expect(akcRegistry.exhibitorAgreement).toBe(AKC_EXHIBITOR_AGREEMENT);
  });
});
