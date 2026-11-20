/**
 * MYK9-2291: the two club-level ASCA facts (§1.5.18 limited-mobility concerns, §1.5.22 RV
 * hook-ups) entered once on the club premium template: the facts list, the checklist line and
 * the publish schema.
 */
import { describe, expect, it } from 'vitest';
import { buildClubTermFacts } from '../premiumAscaFacts';
import { buildPremiumFacts } from '../premiumFacts';
import { missingPremiumFacts, type PremiumRequirementFacts } from '../premiumRequirements';
import { parseGeneratedPremium } from '../premiumPublishSchema';
import { generatedPremium } from './fixtures/generatedPremium';

describe('buildClubTermFacts', () => {
  it('prints nothing when neither is set', () => {
    expect(buildClubTermFacts(undefined)).toEqual([]);
    expect(buildClubTermFacts(generatedPremium().supplemental)).toEqual([]);
    expect(
      buildClubTermFacts({
        ...generatedPremium().supplemental,
        limitedMobilityNotes: '  ',
        rvHookupNotes: null,
      })
    ).toEqual([]);
  });

  it('prints the limited-mobility concerns, trimmed', () => {
    expect(
      buildClubTermFacts({
        ...generatedPremium().supplemental,
        limitedMobilityNotes: ' Gravel lot, 200 ft to the ring ',
      })
    ).toEqual([{ label: 'Limited mobility access', text: 'Gravel lot, 200 ft to the ring' }]);
  });

  it('prints the RV hook-ups, trimmed, after the mobility line', () => {
    expect(
      buildClubTermFacts({
        ...generatedPremium().supplemental,
        rvHookupNotes: ' 30 amp, 10 sites ',
        limitedMobilityNotes: 'Flat paved path',
      })
    ).toEqual([
      { label: 'Limited mobility access', text: 'Flat paved path' },
      { label: 'RV hook-ups', text: '30 amp, 10 sites' },
    ]);
  });
});

describe('buildPremiumFacts showTerms, club facts', () => {
  const withClubFacts = (org: 'AKC' | 'UKC' | 'ASCA') => {
    const premium = { ...generatedPremium(), org };
    premium.supplemental = {
      ...premium.supplemental,
      limitedMobilityNotes: 'Flat paved path',
      rvHookupNotes: '30 amp, 10 sites',
    };
    return premium;
  };

  it('carries both on an ASCA premium', () => {
    expect(buildPremiumFacts(withClubFacts('ASCA')).showTerms.map(t => t.label)).toEqual([
      'Limited mobility access',
      'RV hook-ups',
    ]);
  });

  it.each(['AKC', 'UKC'] as const)('prints neither on %s, though the template holds them', org => {
    expect(buildPremiumFacts(withClubFacts(org)).showTerms).toEqual([]);
  });

  it('prints nothing on an ASCA premium whose template holds neither', () => {
    expect(buildPremiumFacts({ ...generatedPremium(), org: 'ASCA' }).showTerms).toEqual([]);
  });
});

describe('ASCA checklist, limited mobility', () => {
  const targets = { showId: 'show-1', clubId: 'club-1' };
  const facts = (limitedMobilityNotes: string | null | undefined): PremiumRequirementFacts => ({
    clubName: 'Heartland Club',
    venue: 'Tulsa Expo Hall',
    startDate: '2026-06-01',
    fees: { hasAny: true },
    entry: { opens: 'April 1, 2026', closes: 'May 15, 2026' },
    secretary: { name: 'Jane Smith' },
    chair: { name: 'Bob Jones' },
    committee: [],
    template: {
      vetClinic: { name: 'Vet', phone: '555-0100', address: '' },
      accommodationCount: 1,
      awardsDescription: 'Ribbons',
      ...(limitedMobilityNotes === undefined ? {} : { limitedMobilityNotes }),
    },
    trials: [
      { name: 'Saturday', eventNumber: 'A-1', classLabels: ['Container Novice'], judges: [{}] },
    ],
  });
  const ids = (f: PremiumRequirementFacts, registry: 'AKC' | 'UKC' | 'ASCA') =>
    missingPremiumFacts(f, registry, targets).map(i => i.id);

  it('names limited-mobility access when the template has none, linking the club', () => {
    const items = missingPremiumFacts(facts(null), 'ASCA', targets);
    expect(items.map(i => i.id)).toEqual(['limitedMobility']);
    expect(items[0]?.href).toBe('/clubs/club-1');
    expect(items[0]?.message).toContain("club's premium template");
  });

  it('is satisfied once set, and never lists RV hook-ups', () => {
    expect(ids(facts('Flat paved path'), 'ASCA')).toEqual([]);
    expect(ids(facts(null), 'ASCA')).not.toContain('rvHookups');
  });

  it('says nothing for AKC or UKC', () => {
    expect(ids(facts(null), 'AKC')).not.toContain('limitedMobility');
    expect(ids(facts(null), 'UKC')).toEqual([]);
  });
});

describe('premium publish schema, club ASCA facts', () => {
  it('parses a premium generated before the fields existed', () => {
    const parsed = parseGeneratedPremium(structuredClone(generatedPremium()));
    expect(parsed.supplemental.limitedMobilityNotes).toBeUndefined();
  });

  it('keeps both when present, and accepts null', () => {
    const premium = structuredClone(generatedPremium());
    premium.supplemental.limitedMobilityNotes = 'Flat';
    premium.supplemental.rvHookupNotes = '30 amp';
    expect(parseGeneratedPremium(premium).supplemental).toMatchObject({
      limitedMobilityNotes: 'Flat',
      rvHookupNotes: '30 amp',
    });
    premium.supplemental.limitedMobilityNotes = null;
    premium.supplemental.rvHookupNotes = null;
    expect(() => parseGeneratedPremium(premium)).not.toThrow();
  });
});
