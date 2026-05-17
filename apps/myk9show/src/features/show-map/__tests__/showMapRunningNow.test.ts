import { describe, expect, it } from 'vitest';
import { buildShowMapTree } from '../showMapTree';
import { getRunningNowItems } from '../showMapRunningNow';
import type { Show } from '@/types/show-types';
import type { SyncableTrial } from '@/store/trial-store-types';
import type { ShowMapClassInput } from '../showMapTypes';

const show = { id: 'show-1', name: 'Spring Trial' } as Show;

const trial = {
  id: 'trial-1',
  showId: 'show-1',
  showName: 'Spring Trial',
  trialDate: '2026-05-17',
  trialNumber: '1',
  status: 'In Progress',
  timezone: 'America/New_York',
  _version: 1,
  _lastModified: new Date(),
  _lastModifiedBy: 'test',
  _syncStatus: 'synced',
} as SyncableTrial;

describe('getRunningNowItems', () => {
  it('returns active classes in time order with judge and progress details', () => {
    const classes: ShowMapClassInput[] = [
      {
        id: 'class-later',
        trialId: 'trial-1',
        name: 'Exterior Advanced',
        status: 'In Progress',
        judgeName: 'Judge B',
        time: '10:00',
        ring: 2,
        entryCount: 10,
        scoredCount: 5,
      },
      {
        id: 'class-now',
        trialId: 'trial-1',
        name: 'Interior Novice A',
        status: 'In Progress',
        judgeName: 'Judge A',
        time: '9:00',
        ring: 1,
        entryCount: 8,
        scoredCount: 2,
      },
      {
        id: 'class-complete',
        trialId: 'trial-1',
        name: 'Containers Novice A',
        status: 'Complete',
      },
    ];

    const tree = buildShowMapTree({ show, trials: [trial], classes, entries: [] });

    expect(
      getRunningNowItems(
        tree,
        { dayScope: 'today', completionScope: 'active' },
        new Date('2026-05-17T15:00:00.000Z')
      )
    ).toEqual([
      expect.objectContaining({
        nodeId: 'class:class-now',
        label: 'Interior Novice A',
        ringLabel: 'Ring 1',
        judgeName: 'Judge A',
        startTime: '9:00',
        percentScored: 25,
      }),
      expect.objectContaining({
        nodeId: 'class:class-later',
        ringLabel: 'Ring 2',
        percentScored: 50,
      }),
    ]);
  });

  it('ignores the legacy ring 0 sentinel', () => {
    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes: [
        {
          id: 'class-1',
          trialId: 'trial-1',
          name: 'Interior Novice A',
          status: 'In Progress',
          ring: 0,
        },
      ],
      entries: [],
    });

    expect(
      getRunningNowItems(
        tree,
        { dayScope: 'today', completionScope: 'active' },
        new Date('2026-05-17T15:00:00.000Z')
      )[0]?.ringLabel
    ).toBe('Now');
  });

  it('trims string ring labels before display', () => {
    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes: [
        {
          id: 'class-number-ring',
          trialId: 'trial-1',
          name: 'Interior Novice A',
          status: 'In Progress',
          time: '8:00',
          ring: ' 1 ',
        },
        {
          id: 'class-named-ring',
          trialId: 'trial-1',
          name: 'Interior Novice B',
          status: 'In Progress',
          time: '9:00',
          ring: ' Ring 2 ',
        },
      ],
      entries: [],
    });

    expect(
      getRunningNowItems(
        tree,
        { dayScope: 'today', completionScope: 'active' },
        new Date('2026-05-17T15:00:00.000Z')
      ).map(item => item.ringLabel)
    ).toEqual(['Ring 1', 'Ring 2']);
  });

  it('does not show running cards in the Completed view', () => {
    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes: [
        {
          id: 'class-1',
          trialId: 'trial-1',
          name: 'Interior Novice A',
          status: 'In Progress',
        },
      ],
      entries: [],
    });

    expect(
      getRunningNowItems(
        tree,
        { dayScope: 'today', completionScope: 'completed' },
        new Date('2026-05-17T15:00:00.000Z')
      )
    ).toEqual([]);
  });
});
