import { describe, expect, it } from 'vitest';
import type { Show } from '@/types/show-types';
import type { SyncableTrial } from '@/store/trial-store-types';
import type { ShowWorkbenchClassSummary } from '../showWorkbenchTypes';
import {
  computeSetupReadinessSignals,
  isSetupReady,
} from '../setupReadinessSignals';

function show(overrides: Partial<Show> = {}): Show {
  return {
    id: 'show-1',
    name: 'Spring Trial',
    organization: 'AKC',
    startDate: '2026-06-01',
    endDate: '2026-06-02',
    location: 'Louisville, KY',
    clubName: 'Calm Canine Club',
    publishedPremiumUrl: 'https://example.com/premium.pdf',
    publishedPremiumAt: '2026-05-01T00:00:00Z',
    experienceIsPublished: true,
    ...overrides,
  } as Show;
}

function cls(overrides: Partial<ShowWorkbenchClassSummary> = {}): ShowWorkbenchClassSummary {
  return {
    id: 'c1',
    name: 'Container Novice',
    element: 'Containers',
    level: 'Novice',
    section: '',
    judgeName: 'Jane Smith',
    trialId: 't1',
    time: '09:00',
    status: 'pending',
    entryCount: 5,
    scoredCount: 0,
    trialDate: '2026-06-01',
    trialNumber: '1',
    trialName: 'Trial 1',
    ...overrides,
  };
}

function trial(overrides: Partial<SyncableTrial> = {}): SyncableTrial {
  return {
    id: 't1',
    showId: 'show-1',
    showName: 'Spring Trial',
    trialDate: '2026-06-01',
    trialNumber: '1',
    status: 'pending',
    _version: 1,
    _lastModified: new Date(),
    _lastModifiedBy: 'test',
    _syncStatus: 'synced',
    ...overrides,
  } as SyncableTrial;
}

describe('computeSetupReadinessSignals', () => {
  it('returns no signals when everything is in place', () => {
    const signals = computeSetupReadinessSignals({
      show: show(),
      trials: [trial()],
      classes: [cls()],
      judges: ['j1'],
    });
    expect(signals).toEqual([]);
  });

  it('emits show-details-missing when a required show field is blank', () => {
    const signals = computeSetupReadinessSignals({
      show: show({ location: '' }),
      trials: [trial()],
      classes: [cls()],
      judges: ['j1'],
    });
    expect(signals).toContainEqual({
      id: 'show-details-missing',
      label: 'Show details incomplete',
      href: '/shows/show-1?edit=true',
    });
  });

  it('emits no-trials when trials.length === 0', () => {
    const signals = computeSetupReadinessSignals({
      show: show(),
      trials: [],
      classes: [cls()],
      judges: ['j1'],
    });
    expect(signals).toContainEqual({
      id: 'no-trials',
      label: 'No trials yet',
      href: '/shows/show-1?tab=trials',
    });
  });

  it('emits no-classes when classes.length === 0', () => {
    const signals = computeSetupReadinessSignals({
      show: show(),
      trials: [trial()],
      classes: [],
      judges: ['j1'],
    });
    expect(signals).toContainEqual({
      id: 'no-classes',
      label: 'No classes built',
      href: '/trials/t1/classes',
    });
  });

  it('points class work at the Trials tab when no trial exists yet', () => {
    const signals = computeSetupReadinessSignals({
      show: show(),
      trials: [],
      classes: [],
      judges: [],
    });
    expect(signals.find(s => s.id === 'no-classes')?.href).toBe('/shows/show-1?tab=trials');
    expect(signals.find(s => s.id === 'judges-missing')?.href).toBe('/shows/show-1?tab=trials');
  });

  it('emits judges-missing when no roster and a class has no judgeName', () => {
    const signals = computeSetupReadinessSignals({
      show: show(),
      trials: [trial()],
      classes: [cls({ judgeName: '' })],
      judges: [],
    });
    expect(signals).toContainEqual({
      id: 'judges-missing',
      label: 'Judges not assigned',
      href: '/trials/t1/classes',
    });
  });

  it('treats classes-each-have-judge as satisfying judges-missing', () => {
    const signals = computeSetupReadinessSignals({
      show: show(),
      trials: [trial()],
      classes: [cls({ judgeName: 'Judge A' })],
      judges: [],
    });
    expect(signals.find(s => s.id === 'judges-missing')).toBeUndefined();
  });

  it('emits exhibitor-materials-unpublished when premium AND experience are both unset', () => {
    const signals = computeSetupReadinessSignals({
      show: show({
        publishedPremiumUrl: '',
        publishedPremiumAt: '',
        experienceIsPublished: false,
      }),
      trials: [trial()],
      classes: [cls()],
      judges: ['j1'],
    });
    expect(signals).toContainEqual({
      id: 'exhibitor-materials-unpublished',
      label: 'Exhibitor info not published yet',
      href: '#setup-publish',
    });
  });

  it('treats experienceIsPublished alone as satisfying exhibitor materials', () => {
    const signals = computeSetupReadinessSignals({
      show: show({
        publishedPremiumUrl: '',
        publishedPremiumAt: '',
        experienceIsPublished: true,
      }),
      trials: [trial()],
      classes: [cls()],
      judges: ['j1'],
    });
    expect(signals.find(s => s.id === 'exhibitor-materials-unpublished')).toBeUndefined();
  });
});

describe('isSetupReady', () => {
  it('is true when no signals', () => {
    expect(
      isSetupReady({
        show: show(),
        trials: [trial()],
        classes: [cls()],
        judges: ['j1'],
      })
    ).toBe(true);
  });

  it('is false with any pending signal', () => {
    expect(
      isSetupReady({
        show: show(),
        trials: [],
        classes: [cls()],
        judges: ['j1'],
      })
    ).toBe(false);
  });
});
