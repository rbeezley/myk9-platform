import { describe, expect, it } from 'vitest';
import type { EntryClass, MyEntry } from '@/pages/MyEntriesPage/modules';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import {
  buildResultCardModel,
  buildResultCardVisibility,
  isQualifyingResult,
} from './resultCardModel';

function makeEntry(overrides: Partial<MyEntry> = {}): MyEntry {
  return {
    id: 'entry-1',
    registrationId: 'reg-1',
    showId: 'show-1',
    showName: 'Rocky Mountain Classic',
    showDate: new Date('2026-09-14T00:00:00'),
    location: { venue: 'Fairgrounds', city: 'Denver', state: 'CO' },
    dogName: 'Ditto',
    dogId: 'dog-1',
    armband: '27',
    classes: [],
    totalFee: 35,
    entryStatus: EntryStatus.ACCEPTED,
    paymentStatus: PaymentStatus.PAID_ONLINE,
    submittedAt: new Date('2026-08-01T00:00:00'),
    lastUpdated: new Date('2026-09-14T16:00:00'),
    ...overrides,
  };
}

function makeClass(overrides: Partial<EntryClass> = {}): EntryClass {
  return {
    id: 'entry-1',
    name: 'Container Novice A',
    number: '101',
    fee: 35,
    status: 'entered',
    isScored: true,
    resultStatus: 'qualified',
    searchTimeSeconds: 42.18,
    totalFaults: 0,
    finalPlacement: 1,
    resultsReleasedAt: '2026-09-14T20:00:00.000Z',
    dogImageUrl: 'https://example.test/ditto.jpg',
    ...overrides,
  };
}

describe('isQualifyingResult', () => {
  it('returns true only for qualified', () => {
    expect(isQualifyingResult('qualified')).toBe(true);
    expect(isQualifyingResult('nq')).toBe(false);
    expect(isQualifyingResult('absent')).toBe(false);
    expect(isQualifyingResult(undefined)).toBe(false);
  });
});

describe('buildResultCardModel', () => {
  it('builds a dog-first qualifying card from visible fields', () => {
    const model = buildResultCardModel({
      entry: makeEntry(),
      classEntry: makeClass(),
      visibility: {
        showQualification: true,
        showPlacement: true,
        showTime: true,
        showFaults: true,
      },
    });

    expect(model).toMatchObject({
      entryId: 'entry-1',
      dogName: 'Ditto',
      showName: 'Rocky Mountain Classic',
      className: 'Container Novice A',
      resultLabel: 'Q',
      placement: 1,
      placementLabel: '1st',
      timeLabel: '42.18s',
      faultsLabel: '0 faults',
      photoUrl: 'https://example.test/ditto.jpg',
      shareEnabled: true,
      releaseKey: 'entry-1:2026-09-14T20:00:00.000Z:qualified:1',
    });
  });

  it('returns null before release', () => {
    const model = buildResultCardModel({
      entry: makeEntry(),
      classEntry: makeClass({ resultsReleasedAt: undefined }),
      visibility: {
        showQualification: true,
        showPlacement: true,
        showTime: true,
        showFaults: true,
      },
    });

    expect(model).toBeNull();
  });

  it('returns null when qualification is withheld', () => {
    const model = buildResultCardModel({
      entry: makeEntry(),
      classEntry: makeClass(),
      visibility: {
        showQualification: false,
        showPlacement: true,
        showTime: true,
        showFaults: true,
      },
    });

    expect(model).toBeNull();
  });

  it('returns null for non-qualifying results', () => {
    const model = buildResultCardModel({
      entry: makeEntry(),
      classEntry: makeClass({ resultStatus: 'nq', finalPlacement: undefined }),
      visibility: {
        showQualification: true,
        showPlacement: true,
        showTime: true,
        showFaults: true,
      },
    });

    expect(model).toBeNull();
  });

  it('omits withheld optional rows', () => {
    const model = buildResultCardModel({
      entry: makeEntry(),
      classEntry: makeClass(),
      visibility: {
        showQualification: true,
        showPlacement: false,
        showTime: false,
        showFaults: false,
      },
    });

    expect(model).toMatchObject({ resultLabel: 'Q' });
    expect(model).not.toHaveProperty('placement');
    expect(model).not.toHaveProperty('placementLabel');
    expect(model).not.toHaveProperty('timeLabel');
    expect(model).not.toHaveProperty('faultsLabel');
  });

  it('[ADDED] derives visibility from cascade-nulled My Entries fields', () => {
    const visibility = buildResultCardVisibility(
      makeClass({
        resultStatus: 'qualified',
        finalPlacement: undefined,
        searchTimeSeconds: undefined,
        totalFaults: 0,
      })
    );

    expect(visibility).toEqual({
      showQualification: true,
      showPlacement: false,
      showTime: false,
      showFaults: true,
    });
  });
});
