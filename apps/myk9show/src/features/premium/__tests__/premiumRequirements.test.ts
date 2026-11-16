import { describe, expect, it } from 'vitest';
import { PREMIUM_FACT_CATALOG, AKC_EVENT_COMMITTEE_MINIMUM } from '../premiumFacts';
import {
  missingPremiumFacts,
  uncheckedRequiredFactIds,
  type PremiumRequirementFacts,
} from '../premiumRequirements';

const targets = { showId: 'show-1', clubId: 'club-1' };

function completeFacts(): PremiumRequirementFacts {
  return {
    clubName: 'Heartland Club',
    venue: 'Tulsa Expo Hall',
    startDate: '2026-06-01',
    fees: { hasAny: true },
    entry: { opens: 'April 1, 2026', closes: 'May 15, 2026' },
    secretary: { name: 'Jane Smith' },
    chair: { name: 'Bob Jones' },
    committee: ['A', 'B', 'C', 'D', 'E'],
    trials: [
      {
        name: 'Saturday Trial',
        eventNumber: 'AKC-1',
        classLabels: ['Container Novice'],
        judges: [{}],
      },
    ],
  };
}

function idsFor(facts: PremiumRequirementFacts, registry: 'AKC' | 'UKC' | 'ASCA' = 'AKC') {
  return missingPremiumFacts(facts, registry, targets).map(i => i.id);
}

describe('missingPremiumFacts (MYK9-2053)', () => {
  it('lists nothing for an AKC show with every fact present', () => {
    expect(missingPremiumFacts(completeFacts(), 'AKC', targets)).toEqual([]);
  });

  it.each([
    ['clubName', { clubName: null }, '/shows/show-1?edit=true'],
    ['venue', { venue: '' }, '/shows/show-1?edit=true'],
    ['dates', { startDate: '' }, '/shows/show-1?edit=true'],
    ['fees', { fees: { hasAny: false } }, '/shows/show-1?edit=true&editTab=fees'],
    ['entryWindow', { entry: { opens: null, closes: 'May 15, 2026' } }, '/shows/show-1?edit=true'],
    ['secretary', { secretary: { name: null } }, '/shows/show-1?edit=true&editTab=personnel'],
    ['chair', { chair: null }, '/shows/show-1?edit=true&editTab=personnel'],
    ['committee', { committee: [] }, '/clubs/club-1?tab=members'],
    [
      'eventNumber',
      { trials: [{ name: 'Saturday Trial', eventNumber: null, classLabels: ['x'], judges: [{}] }] },
      '/shows/show-1',
    ],
    [
      'judges',
      {
        trials: [{ name: 'Saturday Trial', eventNumber: 'AKC-1', classLabels: ['x'], judges: [] }],
      },
      '/shows/show-1?edit=true&editTab=judges',
    ],
    [
      'classes',
      { trials: [{ name: 'Saturday Trial', eventNumber: 'AKC-1', classLabels: [], judges: [{}] }] },
      expect.stringContaining('/shows/show-1'),
    ],
  ])('lists %s once, with a link to where it is entered', (id, patch, href) => {
    const items = missingPremiumFacts({ ...completeFacts(), ...patch }, 'AKC', targets);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id, href });
    expect(items[0]!.message).toMatch(/^AKC requires /);
    expect(items[0]!.message).not.toMatch(/—|–/);
  });

  describe('per trial', () => {
    const trial = (name: string, o: { eventNumber?: string | null; judges?: unknown[] } = {}) => ({
      name,
      eventNumber: o.eventNumber === undefined ? 'AKC-1' : o.eventNumber,
      classLabels: ['Container Novice'],
      judges: o.judges ?? [{}],
    });

    it('gives the trial without a judge its own item, naming it', () => {
      const items = missingPremiumFacts(
        { ...completeFacts(), trials: [trial('Saturday'), trial('Sunday', { judges: [] })] },
        'AKC',
        targets
      );
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        id: 'judges',
        key: 'judges:1',
        message: 'AKC requires a judge for Sunday. Assign one in Judges.',
        href: '/shows/show-1?edit=true&editTab=judges',
      });
    });

    it('gives each trial with no event number its own item, naming it', () => {
      const items = missingPremiumFacts(
        {
          ...completeFacts(),
          trials: [
            trial('Saturday'),
            trial('Sunday', { eventNumber: null }),
            trial('Monday', { eventNumber: ' ' }),
          ],
        },
        'AKC',
        targets
      );
      expect(items.map(i => [i.key, i.message])).toEqual([
        ['eventNumber:1', 'AKC requires an event number for Sunday. Add it on the trial.'],
        ['eventNumber:2', 'AKC requires an event number for Monday. Add it on the trial.'],
      ]);
    });

    it('names an unnamed trial by its position and keeps every key unique', () => {
      const items = missingPremiumFacts(
        {
          ...completeFacts(),
          trials: [trial('', { judges: [], eventNumber: null }), trial('', { judges: [] })],
        },
        'AKC',
        targets
      );
      expect(items.map(i => i.message)).toEqual([
        'AKC requires an event number for Trial 1. Add it on the trial.',
        'AKC requires a judge for Trial 1. Assign one in Judges.',
        'AKC requires a judge for Trial 2. Assign one in Judges.',
      ]);
      expect(new Set(items.map(i => i.key)).size).toBe(items.length);
    });
  });

  it('says how short the committee is, with the minimum from the catalog', () => {
    const committee = PREMIUM_FACT_CATALOG.find(f => f.id === 'committee')!;
    expect(committee.minimumBy?.AKC).toBe(AKC_EVENT_COMMITTEE_MINIMUM);
    const [item] = missingPremiumFacts(
      { ...completeFacts(), committee: ['A', 'B', 'C'] },
      'AKC',
      targets
    );
    expect(item).toMatchObject({
      id: 'committee',
      message:
        'AKC requires at least 5 Event Committee members; 3 are listed. Add the rest on the club.',
    });
  });

  it('accepts a committee exactly at the minimum', () => {
    expect(idsFor({ ...completeFacts(), committee: ['A', 'B', 'C', 'D', 'E'] })).toEqual([]);
  });

  it('has no link for a club fact when the show has no club', () => {
    const [item] = missingPremiumFacts({ ...completeFacts(), committee: [] }, 'AKC', {
      showId: 'show-1',
      clubId: null,
    });
    expect(item!.href).toBeNull();
  });

  it('does not list a fact whose source could not be read', () => {
    const items = missingPremiumFacts(
      { ...completeFacts(), committee: [], secretary: { name: null } },
      'AKC',
      targets,
      new Set(['committee'])
    );
    expect(items.map(i => i.id)).toEqual(['secretary']);
  });

  it('lists every AKC-only fact for AKC and none of them for a registry that requires nothing', () => {
    const empty: PremiumRequirementFacts = {
      clubName: null,
      venue: '',
      startDate: '',
      fees: { hasAny: false },
      entry: { opens: null, closes: null },
      secretary: { name: null },
      chair: null,
      committee: [],
      trials: [],
    };
    const akc = idsFor(empty, 'AKC');
    expect(akc).toEqual(
      expect.arrayContaining(['clubName', 'venue', 'secretary', 'chair', 'committee', 'classes'])
    );
    expect(idsFor(empty, 'UKC')).toEqual([]);
    expect(idsFor(empty, 'ASCA')).toEqual([]);
  });

  it('never lists a fact the registry does not require, even when it is empty', () => {
    const notRequired = PREMIUM_FACT_CATALOG.filter(f => f.requiredBy.length === 0).map(f => f.id);
    expect(notRequired).toEqual(
      expect.arrayContaining(['officers', 'vetClinic', 'trialInformation'])
    );
    const empty = missingPremiumFacts(
      { ...completeFacts(), clubName: null, venue: '', committee: [] },
      'AKC',
      targets
    ).map(i => i.id);
    for (const id of notRequired) expect(empty).not.toContain(id);
  });

  it('covers every fact the catalog requires: a new required fact must be checked or supplied', () => {
    expect(uncheckedRequiredFactIds()).toEqual([]);
  });
});
