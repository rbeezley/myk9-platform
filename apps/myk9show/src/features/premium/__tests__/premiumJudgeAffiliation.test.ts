/**
 * MYK9-2292 (ASCA §1.5.7): a judge's affiliation, typed once on the judge's person record: the
 * facts (ASCA prints it, other registries never), the checklist line and the publish schema.
 */
import { describe, expect, it } from 'vitest';
import { buildPremiumFacts } from '../premiumFacts';
import { judgeHeading } from '../pdf/bodies/judgeLine';
import { missingPremiumFacts, type PremiumRequirementFacts } from '../premiumRequirements';
import { parseGeneratedPremium } from '../premiumPublishSchema';
import type { GeneratedPremium } from '@/types/premium-types';
import { generatedPremium } from './fixtures/generatedPremium';
import { getShowEditHref } from '@/components/shows/showEditRoutes';

const premiumWithJudge = (
  org: GeneratedPremium['org'],
  judge: GeneratedPremium['trials'][number]['judges'][number]
): GeneratedPremium => {
  const premium = structuredClone(generatedPremium());
  premium.org = org;
  premium.trials = [
    {
      name: 'Saturday',
      date: '2026-06-06',
      startTime: null,
      eventNumber: null,
      type: 'Scent Detection',
      judges: [judge],
      classes: [{ element: 'Container', level: 'Novice', section: null }],
    },
  ];
  return premium;
};

const judgeFact = (premium: GeneratedPremium) => buildPremiumFacts(premium).trials[0]!.judges[0]!;

describe('judge affiliation facts', () => {
  const judge = {
    name: 'Jane Smith',
    residence: 'Springfield, IL',
    affiliation: ' ASCA-approved judge, Region 4 ',
    classes: [],
  };

  it('carries the trimmed affiliation on an ASCA premium', () => {
    expect(judgeFact(premiumWithJudge('ASCA', judge)).affiliation).toBe(
      'ASCA-approved judge, Region 4'
    );
  });

  it.each(['AKC', 'UKC'] as const)('carries none on %s, though the judge holds one', org => {
    expect(judgeFact(premiumWithJudge(org, judge)).affiliation).toBeNull();
  });

  it.each([null, '', '   ', undefined])(
    'is null on ASCA when the affiliation is %j',
    affiliation => {
      expect(judgeFact(premiumWithJudge('ASCA', { ...judge, affiliation })).affiliation).toBeNull();
    }
  );

  it('prints beside the name and residence, and nothing extra when empty', () => {
    expect(judgeHeading(judgeFact(premiumWithJudge('ASCA', judge)))).toBe(
      'Jane Smith, Springfield, IL (ASCA-approved judge, Region 4)'
    );
    expect(judgeHeading(judgeFact(premiumWithJudge('ASCA', { ...judge, affiliation: null })))).toBe(
      'Jane Smith, Springfield, IL'
    );
    expect(judgeHeading(judgeFact(premiumWithJudge('AKC', judge)))).toBe(
      'Jane Smith, Springfield, IL'
    );
  });
});

describe('ASCA checklist, judge affiliation', () => {
  const targets = { showId: 'show-1', clubId: 'club-1' };
  const facts = (
    judgeAffiliations: PremiumRequirementFacts['judgeAffiliations']
  ): PremiumRequirementFacts => ({
    clubName: 'Heartland Club',
    venue: 'Tulsa Expo Hall',
    startDate: '2026-06-01',
    fees: { hasAny: true },
    entry: { opens: 'April 1, 2026', closes: 'May 15, 2026' },
    secretary: { name: 'Jane Smith' },
    chair: { name: 'Bob Jones' },
    committee: [],
    trials: [
      { name: 'Saturday', eventNumber: 'A-1', classLabels: ['Container Novice'], judges: [{}] },
    ],
    ...(judgeAffiliations && { judgeAffiliations }),
  });
  const affiliationItems = (f: PremiumRequirementFacts, registry: 'AKC' | 'UKC' | 'ASCA') =>
    missingPremiumFacts(f, registry, targets).filter(i => i.id === 'judgeAffiliation');

  it('names each judge with no affiliation and links to the Judges tab of Edit show', () => {
    const items = affiliationItems(
      facts([
        { id: 'j1', name: 'Jane Smith', affiliation: null },
        { id: 'j2', name: 'Bob Lee', affiliation: 'ASCA-approved judge' },
        { id: 'j3', name: 'Cy Young', affiliation: '  ' },
      ]),
      'ASCA'
    );
    expect(items.map(i => i.key)).toEqual(['judgeAffiliation:j1', 'judgeAffiliation:j3']);
    expect(items[0]?.href).toBe(getShowEditHref(targets.showId, 'judges'));
    expect(items[1]?.href).toBe(getShowEditHref(targets.showId, 'judges'));
    expect(items[1]?.message).toBe(
      "ASCA requires each judge's affiliation. Add Cy Young's affiliation in Edit show, under Judges."
    );
  });

  it('is satisfied when every judge has one, and silent when the roster is not known', () => {
    expect(
      affiliationItems(facts([{ id: 'j2', name: 'Bob Lee', affiliation: 'Region 4' }]), 'ASCA')
    ).toEqual([]);
    expect(affiliationItems(facts(undefined), 'ASCA')).toEqual([]);
  });

  it('says nothing for AKC or UKC', () => {
    const f = facts([{ id: 'j1', name: 'Jane Smith', affiliation: null }]);
    expect(affiliationItems(f, 'AKC')).toEqual([]);
    expect(affiliationItems(f, 'UKC')).toEqual([]);
  });
});

describe('premium publish schema, judge affiliation', () => {
  it('parses a premium generated before the field existed', () => {
    const premium = premiumWithJudge('ASCA', { name: 'Jane Smith', classes: [] });
    const parsed = parseGeneratedPremium(premium);
    expect(parsed.trials[0]?.judges[0]?.affiliation).toBeUndefined();
    expect(parsed.trials[0]?.judges[0]?.residence).toBeNull();
  });

  it('keeps it when present, and accepts null', () => {
    const premium = premiumWithJudge('ASCA', {
      name: 'Jane Smith',
      affiliation: 'ASCA-approved judge, Region 4',
      classes: [],
    });
    expect(parseGeneratedPremium(premium).trials[0]?.judges[0]?.affiliation).toBe(
      'ASCA-approved judge, Region 4'
    );
    premium.trials[0]!.judges[0]!.affiliation = null;
    expect(parseGeneratedPremium(premium).trials[0]?.judges[0]?.affiliation).toBeNull();
  });
});
