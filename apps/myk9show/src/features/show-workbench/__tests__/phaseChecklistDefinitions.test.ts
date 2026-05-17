import { describe, expect, it } from 'vitest';
import { CLASS_STATUS } from '@myk9/core';
import {
  getPhaseChecklistDefinitions,
  type PhaseChecklistContext,
} from '../phaseChecklistDefinitions';
import type { Show } from '@/types/show-types';
import type { SyncableTrial } from '@/store/trial-store-types';

const baseClass = {
  id: 'class-1',
  name: 'Container Novice',
  element: 'Container',
  level: 'Novice',
  section: 'A',
  judgeName: 'Judge Judy',
  trialId: 'trial-1',
  time: '09:00',
  status: CLASS_STATUS.COMPLETED,
  entryCount: 3,
  scoredCount: 3,
  trialDate: '2026-03-22',
  trialNumber: '1',
  trialName: 'Trial 1',
};

const show = {
  id: 'show-1',
  name: 'Bluegrass Classic',
  organization: 'AKC',
  startDate: '2026-03-22',
  endDate: '2026-03-23',
  location: 'Louisville, KY',
  clubName: 'Bluegrass KC',
  status: 'accepting_entries',
  events: [],
  source: 'myK9Show',
  entryOpenDate: '2026-01-01',
  entryCloseDate: '2026-03-01',
  preEntryFee: '$30',
  clubId: 'club-1',
  clubAddress: '',
  clubEmail: '',
  logoUrl: '',
  coverImageUrl: '',
  accentColor: '',
  assignedJudges: [],
  stats: [],
  trials: [],
  publishedPremiumAt: '2026-01-15T12:00:00.000Z',
} satisfies Show;

const trial = {
  id: 'trial-1',
  showId: 'show-1',
  showName: 'Bluegrass Classic',
  trialDate: '2026-03-22',
  trialNumber: '1',
  status: CLASS_STATUS.SCHEDULED,
  _version: 1,
  _lastModified: new Date('2026-01-01T00:00:00.000Z'),
  _lastModifiedBy: 'test',
  _syncStatus: 'synced',
} satisfies SyncableTrial;

function baseContext(overrides: Partial<PhaseChecklistContext> = {}): PhaseChecklistContext {
  return {
    show,
    trials: [trial],
    classes: [baseClass],
    entries: [{ id: 'entry-1', class_id: 'class-1' }],
    judges: [],
    ...overrides,
  };
}

function itemStatus(id: string, context: PhaseChecklistContext): boolean {
  const definition = getPhaseChecklistDefinitions('setup')
    .concat(getPhaseChecklistDefinitions('today'))
    .concat(getPhaseChecklistDefinitions('wrap-up'))
    .find(item => item.id === id);
  if (!definition) throw new Error(`Missing definition ${id}`);
  return definition.autoComplete(context);
}

describe('phaseChecklistDefinitions', () => {
  it('auto-completes setup items from show, trial, class, and judge data', () => {
    const context = baseContext();

    expect(itemStatus('setup-show-details', context)).toBe(true);
    expect(itemStatus('setup-trials-added', context)).toBe(true);
    expect(itemStatus('setup-classes-built', context)).toBe(true);
    expect(itemStatus('setup-judges-assigned', context)).toBe(true);
    expect(itemStatus('setup-exhibitor-materials', context)).toBe(true);
  });

  it('requires class times before marking today run order ready', () => {
    const context = baseContext({
      classes: [
        {
          ...baseClass,
          time: '',
        },
      ],
    });

    expect(itemStatus('today-run-order-ready', context)).toBe(false);
  });

  it('marks wrap-up scoring complete only when all entries are scored', () => {
    const incomplete = baseContext({
      classes: [
        {
          ...baseClass,
          scoredCount: 2,
        },
      ],
    });
    const complete = baseContext();

    expect(itemStatus('wrap-results-scored', incomplete)).toBe(false);
    expect(itemStatus('wrap-results-scored', complete)).toBe(true);
  });
});
