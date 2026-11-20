/**
 * MYK9-2290: the ASCA show-level facts (§1.5.2, §1.5.9, §1.5.19, §1.5.24) as the premium prints
 * them, the pre-publish checklist lines, and the publish schema.
 */
import { describe, expect, it } from 'vitest';
import { buildShowTermFacts } from '../premiumAscaFacts';
import { buildPremiumFacts } from '../premiumFacts';
import { missingPremiumFacts, type PremiumRequirementFacts } from '../premiumRequirements';
import { parseGeneratedPremium } from '../premiumPublishSchema';
import { generatedPremium } from './fixtures/generatedPremium';

describe('buildShowTermFacts', () => {
  it('prints nothing when no fact is set', () => {
    expect(buildShowTermFacts({})).toEqual([]);
    expect(
      buildShowTermFacts({
        ascaSanctionStatus: null,
        scentsByLevel: '   ',
        spectatorsPolicy: null,
        photographerContact: '',
      })
    ).toEqual([]);
  });

  it.each([
    ['pending', 'Pending'],
    ['approved', 'Approved'],
  ] as const)('prints the sanctioning status %s', (ascaSanctionStatus, text) => {
    expect(buildShowTermFacts({ ascaSanctionStatus })).toEqual([
      { label: 'Sanctioning status', text },
    ]);
  });

  it('prints the scents, trimmed', () => {
    expect(buildShowTermFacts({ scentsByLevel: '  Novice birch; Open birch and anise ' })).toEqual([
      { label: 'Scents used for each level', text: 'Novice birch; Open birch and anise' },
    ]);
  });

  it.each([
    ['allowed', 'Spectators and videoing are allowed.'],
    ['not_allowed', 'Spectators and videoing are not allowed.'],
  ] as const)('prints the spectator policy %s', (spectatorsPolicy, text) => {
    expect(buildShowTermFacts({ spectatorsPolicy })).toEqual([
      { label: 'Spectators and videoing', text },
    ]);
  });

  it('prints the photographer contact, trimmed', () => {
    expect(buildShowTermFacts({ photographerContact: ' Pat, 555-0100 ' })).toEqual([
      { label: 'Show photographer', text: 'Pat, 555-0100' },
    ]);
  });

  it('keeps the four in the rulebook order', () => {
    const labels = buildShowTermFacts({
      photographerContact: 'Pat',
      spectatorsPolicy: 'allowed',
      scentsByLevel: 'Birch',
      ascaSanctionStatus: 'approved',
    }).map(f => f.label);
    expect(labels).toEqual([
      'Sanctioning status',
      'Scents used for each level',
      'Spectators and videoing',
      'Show photographer',
    ]);
  });
});

describe('buildPremiumFacts showTerms', () => {
  it('is empty for a premium without the fields', () => {
    expect(buildPremiumFacts(generatedPremium()).showTerms).toEqual([]);
  });

  it('carries the facts the show holds on an ASCA premium', () => {
    const premium = { ...generatedPremium(), org: 'ASCA' as const };
    premium.show = { ...premium.show, scentsByLevel: 'Birch' };
    expect(buildPremiumFacts(premium).showTerms).toEqual([
      { label: 'Scents used for each level', text: 'Birch' },
    ]);
  });

  it('prints none of them on another registry, even when the show still holds them', () => {
    const premium = { ...generatedPremium(), org: 'AKC' as const };
    premium.show = { ...premium.show, scentsByLevel: 'Birch', ascaSanctionStatus: 'approved' };
    expect(buildPremiumFacts(premium).showTerms).toEqual([]);
  });
});

describe('ASCA checklist lines', () => {
  const targets = { showId: 'show-1', clubId: 'club-1' };
  const facts = (showTerms: ReadonlyArray<{ label: string }>): PremiumRequirementFacts => ({
    clubName: 'Heartland Club',
    venue: 'Tulsa Expo Hall',
    startDate: '2026-06-01',
    fees: { hasAny: true },
    entry: { opens: 'April 1, 2026', closes: 'May 15, 2026' },
    secretary: { name: 'Jane Smith' },
    chair: { name: 'Bob Jones' },
    committee: [],
    showTerms,
    trials: [
      { name: 'Saturday', eventNumber: 'A-1', classLabels: ['Container Novice'], judges: [{}] },
    ],
  });
  const ids = (f: PremiumRequirementFacts, registry: 'AKC' | 'UKC' | 'ASCA') =>
    missingPremiumFacts(f, registry, targets).map(i => i.id);

  it('names the sanction status, scents and spectators when empty, not the photographer', () => {
    expect(ids(facts([]), 'ASCA')).toEqual([
      'ascaSanctionStatus',
      'scentsByLevel',
      'spectatorsPolicy',
    ]);
  });

  it('says where to fix each one', () => {
    const items = missingPremiumFacts(facts([]), 'ASCA', targets);
    expect(items.map(i => i.message)).toEqual([
      'ASCA requires the sanctioning status (pending or approved). Add it in Edit show, under Premium.',
      'ASCA requires the scents used for each level. Add it in Edit show, under Premium.',
      'ASCA requires whether spectators and videoing are allowed. Add it in Edit show, under Premium.',
    ]);
    expect(items.every(i => i.href === '/shows/show-1?edit=true&editTab=premium')).toBe(true);
  });

  it('lists only the one still empty', () => {
    const set = [{ label: 'Sanctioning status' }, { label: 'Spectators and videoing' }];
    expect(ids(facts(set), 'ASCA')).toEqual(['scentsByLevel']);
  });

  it('lists nothing once all three are set (the photographer is optional)', () => {
    const set = buildShowTermFacts({
      ascaSanctionStatus: 'approved',
      scentsByLevel: 'Birch',
      spectatorsPolicy: 'allowed',
    });
    expect(ids(facts(set), 'ASCA')).toEqual([]);
  });

  it('says nothing for AKC or UKC, which do not ask for these', () => {
    expect(ids(facts([]), 'AKC')).not.toContain('ascaSanctionStatus');
    expect(ids(facts([]), 'UKC')).toEqual([]);
  });

  it('says nothing where the printed terms are not known here', () => {
    const unknown = facts([]);
    delete (unknown as { showTerms?: unknown }).showTerms;
    expect(ids(unknown, 'ASCA')).toEqual([]);
  });
});

describe('premium publish schema, ASCA show facts', () => {
  const base = () => structuredClone(generatedPremium());

  it('parses a premium generated before the fields existed', () => {
    const premium = base();
    expect(() => parseGeneratedPremium(premium)).not.toThrow();
    expect(parseGeneratedPremium(premium).show.ascaSanctionStatus).toBeUndefined();
  });

  it('keeps the fields when present (zod would strip an unlisted key)', () => {
    const premium = base();
    premium.show.ascaSanctionStatus = 'pending';
    premium.show.scentsByLevel = 'Birch';
    premium.show.spectatorsPolicy = 'not_allowed';
    premium.show.photographerContact = 'Pat';
    const parsed = parseGeneratedPremium(premium).show;
    expect(parsed).toMatchObject({
      ascaSanctionStatus: 'pending',
      scentsByLevel: 'Birch',
      spectatorsPolicy: 'not_allowed',
      photographerContact: 'Pat',
    });
  });

  it('accepts null for each (a generated premium with nothing set)', () => {
    const premium = base();
    premium.show.ascaSanctionStatus = null;
    premium.show.scentsByLevel = null;
    premium.show.spectatorsPolicy = null;
    premium.show.photographerContact = null;
    expect(() => parseGeneratedPremium(premium)).not.toThrow();
  });

  it('refuses a value the database check would refuse', () => {
    const premium = base() as unknown as { show: Record<string, unknown> };
    premium.show.ascaSanctionStatus = 'maybe';
    expect(() => parseGeneratedPremium(premium)).toThrow();
  });
});
