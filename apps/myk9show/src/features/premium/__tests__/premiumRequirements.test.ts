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
    secretary: { name: 'Jane Smith', mailingAddress: 'PO Box 9, Tulsa, OK' },
    chair: { name: 'Bob Jones', mailingAddress: 'PO Box 77, Tulsa, OK' },
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

describe('official mailing addresses (MYK9-2065)', () => {
  const personnel = '/shows/show-1?edit=true&editTab=personnel';

  it('lists the Secretary and Chair addresses as missing for AKC when both are empty', () => {
    const items = missingPremiumFacts(
      {
        ...completeFacts(),
        secretary: { name: 'Jane Smith', mailingAddress: null },
        chair: { name: 'Bob Jones', mailingAddress: '  ' },
      },
      'AKC',
      targets
    );
    expect(items.map(i => [i.id, i.href])).toEqual([
      ['secretaryAddress', personnel],
      ['chairAddress', personnel],
    ]);
    expect(items[0].message).toContain("Trial Secretary's mailing address");
    expect(items[1].message).toContain("Trial Chair's mailing address");
  });

  it('lists nothing once both are filled in, and nothing for UKC or ASCA', () => {
    expect(missingPremiumFacts(completeFacts(), 'AKC', targets)).toEqual([]);
    const empty = {
      ...completeFacts(),
      secretary: { name: 'Jane Smith', mailingAddress: null },
      chair: { name: 'Bob Jones', mailingAddress: null },
    };
    expect(idsFor(empty, 'UKC')).toEqual([]);
    expect(idsFor(empty, 'ASCA')).toEqual([]);
  });

  it('does not ask for the address of an official the show does not have yet', () => {
    const ids = idsFor({ ...completeFacts(), secretary: { name: null }, chair: null });
    expect(ids).toEqual(['secretary', 'chair']);
  });
});

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
      '/shows/show-1?select=classes',
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
        message: 'AKC requires a judge for Sunday. Assign one to its classes in Select classes.',
        href: '/shows/show-1?select=classes',
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
        [
          'eventNumber:1',
          'AKC requires an event number for Sunday. Open Trials and choose Edit on that trial.',
        ],
        [
          'eventNumber:2',
          'AKC requires an event number for Monday. Open Trials and choose Edit on that trial.',
        ],
      ]);
    });

    it('leaves a trial with no classes yet to the classes item, with no judge item of its own', () => {
      const items = missingPremiumFacts(
        {
          ...completeFacts(),
          trials: [{ ...trial('Sunday', { judges: [] }), classLabels: [] }],
        },
        'AKC',
        targets
      );
      expect(items.map(i => i.id)).toEqual(['classes']);
    });

    it('scopes the judge link to the trial when its id is known', () => {
      const [item] = missingPremiumFacts(
        { ...completeFacts(), trials: [{ ...trial('Sunday', { judges: [] }), id: 't2' }] },
        'AKC',
        targets
      );
      expect(item!.href).toBe('/shows/show-1?select=classes&trialId=t2');
    });

    it('with no trials reports only the classes, not judges or event numbers per trial', () => {
      const items = missingPremiumFacts({ ...completeFacts(), trials: [] }, 'AKC', targets);
      expect(items.map(i => i.id)).toEqual(['classes']);
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
        'AKC requires an event number for Trial 1. Open Trials and choose Edit on that trial.',
        'AKC requires a judge for Trial 1. Assign one to its classes in Select classes.',
        'AKC requires a judge for Trial 2. Assign one to its classes in Select classes.',
      ]);
      expect(new Set(items.map(i => i.key)).size).toBe(items.length);
    });
  });

  it('sends the committee row to the show Personnel tab when the show has its own committee', () => {
    const [item] = missingPremiumFacts({ ...completeFacts(), committee: [] }, 'AKC', {
      ...targets,
      committeeSource: 'show',
    });
    expect(item?.id).toBe('committee');
    expect(item?.href).toBe('/shows/show-1?edit=true&editTab=personnel');
  });

  it('sends the committee row to the club Members tab when the show uses the club committee', () => {
    const [item] = missingPremiumFacts({ ...completeFacts(), committee: [] }, 'AKC', {
      ...targets,
      committeeSource: 'club',
    });
    expect(item?.href).toBe('/clubs/club-1?tab=members');
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
    // MYK9-2225: ASCA §1.5 asks for the club, location, dates, officials, classes and judges too,
    // but not AKC's event committee, event number or the officials' mailing addresses.
    const asca = idsFor(empty, 'ASCA');
    expect(asca).toEqual(
      expect.arrayContaining(['clubName', 'venue', 'secretary', 'chair', 'classes'])
    );
    expect(asca).not.toEqual(expect.arrayContaining(['committee']));
    expect(asca.some(id => id.startsWith('eventNumber') || id.endsWith('Address'))).toBe(false);
  });

  it('never lists a fact the registry does not require, even when it is empty', () => {
    const notRequired = PREMIUM_FACT_CATALOG.filter(f => f.requiredBy.length === 0).map(f => f.id);
    expect(notRequired).toEqual(
      expect.arrayContaining(['officers', 'hospitality', 'trialInformation'])
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

describe('recording fee warning (MYK9-2044)', () => {
  const withDates = (...recordingFeeDates: string[]) => ({ ...completeFacts(), recordingFeeDates });

  it('warns, without guessing an amount or a link, when an AKC trial date has no known rate', () => {
    expect(missingPremiumFacts(withDates('2028-03-04'), 'AKC', targets)).toEqual([
      {
        id: 'recordingFee',
        key: 'recordingFee:2028-03-04',
        message:
          'The AKC recording fee for March 4, 2028 is not known to the app yet, so the premium will not state it. Confirm the fee with AKC before you publish.',
        href: null,
      },
    ]);
  });

  it('names only the dates with no rate, and none for a 2027 show', () => {
    expect(idsFor(withDates('2027-06-12'))).toEqual([]);
    expect(
      missingPremiumFacts(withDates('2027-12-31', '2028-01-01'), 'AKC', targets).map(i => i.key)
    ).toEqual(['recordingFee:2028-01-01']);
  });

  it('says nothing for a UKC show, or when the dates are not known here', () => {
    expect(idsFor(withDates('2028-03-04'), 'UKC')).toEqual([]);
    expect(idsFor(completeFacts())).toEqual([]);
  });
});

describe('ASCA club-template and contact facts (MYK9-2286)', () => {
  const template = (over: Partial<NonNullable<PremiumRequirementFacts['template']>> = {}) => ({
    vetClinic: { name: 'Valley Emergency Vet' },
    accommodationCount: 2,
    awardsDescription: 'Ribbons and rosettes',
    ...over,
  });
  const asca = (patch: Partial<PremiumRequirementFacts> = {}) => ({
    ...completeFacts(),
    template: template(),
    secretary: { name: 'Jane Smith', email: 'jane@example.com', phone: null },
    chair: { name: 'Bob Jones', email: null, phone: '555-0100' },
    ...patch,
  });

  it('lists nothing for a complete ASCA show', () => {
    expect(idsFor(asca(), 'ASCA')).toEqual([]);
  });

  it.each([
    ['awards', { awardsDescription: '  ' }, 'the awards'],
    ['vetClinic', { vetClinic: null }, 'the emergency veterinarian'],
    ['accommodations', { accommodationCount: 0 }, 'accommodations'],
  ])('lists %s when the template leaves it empty, and links the club', (id, patch, words) => {
    const items = missingPremiumFacts(asca({ template: template(patch) }), 'ASCA', targets);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id, href: '/clubs/club-1' });
    expect(items[0]!.message).toMatch(
      new RegExp(`^ASCA requires ${words}\\. Add (it|them) to the club's premium template\\.$`)
    );
  });

  it('lists a club with no template at all as missing all three', () => {
    const none = { vetClinic: null, accommodationCount: 0, awardsDescription: null };
    expect(idsFor(asca({ template: none }), 'ASCA')).toEqual([
      'vetClinic',
      'accommodations',
      'awards',
    ]);
  });

  it('says nothing about the template when it is not known', () => {
    expect(idsFor(completeFacts(), 'ASCA')).toEqual([]);
  });

  it('lists the Secretary and the Chair when each has neither phone nor email', () => {
    const items = missingPremiumFacts(
      asca({
        secretary: { name: 'Jane Smith', email: ' ', phone: null },
        chair: { name: 'Bob Jones', email: null, phone: '' },
      }),
      'ASCA',
      targets
    );
    expect(items.map(i => [i.id, i.href])).toEqual([
      ['secretaryContact', '/shows/show-1?edit=true&editTab=personnel'],
      ['chairContact', '/shows/show-1?edit=true&editTab=personnel'],
    ]);
    expect(items[0]!.message).toBe(
      'ASCA requires a phone or email for the Trial Secretary. Add one in Edit show, under Personnel.'
    );
  });

  it('does not ask for a contact of an official the show does not have yet', () => {
    expect(
      idsFor(asca({ secretary: { name: null, email: null, phone: null }, chair: null }), 'ASCA')
    ).toEqual(['secretary', 'chair']);
  });

  it('leaves AKC and UKC unchanged: the same gaps list nothing new', () => {
    const gappy = asca({
      template: { vetClinic: null, accommodationCount: 0, awardsDescription: null },
      secretary: { name: 'Jane Smith', email: null, phone: null, mailingAddress: 'PO Box 1' },
      chair: { name: 'Bob Jones', email: null, phone: null, mailingAddress: 'PO Box 2' },
    });
    expect(idsFor(gappy, 'AKC')).toEqual([]);
    expect(idsFor(gappy, 'UKC')).toEqual([]);
  });
});
