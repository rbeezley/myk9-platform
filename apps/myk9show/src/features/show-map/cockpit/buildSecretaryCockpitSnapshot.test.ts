import { describe, expect, it } from 'vitest';

import { buildSecretaryCockpitSnapshot } from './buildSecretaryCockpitSnapshot';
import type { ShowMapTree } from '../showMapTypes';

const tree: ShowMapTree = {
  root: { id: 'show:show-1', type: 'show', label: 'Show', childrenCount: 1 },
  nodesById: {
    'show:show-1': { id: 'show:show-1', type: 'show', label: 'Show', childrenCount: 1 },
    'trial:trial-1': {
      id: 'trial:trial-1',
      type: 'trial',
      label: 'Trial 1',
      parentId: 'show:show-1',
      childrenCount: 1,
    },
    'class:class-1': {
      id: 'class:class-1',
      type: 'class',
      label: 'Container Novice',
      status: { value: 'in_progress', label: 'In progress', kind: 'active' },
      scoreHref: '/scoring/class-1',
      parentId: 'trial:trial-1',
      childrenCount: 0,
    },
  },
  childIdsByParentId: {
    'show:show-1': ['trial:trial-1'],
    'trial:trial-1': ['class:class-1'],
    'class:class-1': [],
  },
};

describe('buildSecretaryCockpitSnapshot', () => {
  /**
   * Audit H1/H3. This builder used to run `entryCount ?? 0`, which made
   * `secretaryCockpitModel`'s `{ evidence: 'unknown' }` progress branch
   * unreachable -- a paused entries read then rendered "0 of 0 scored" on a
   * class with 40 entries, and disabled the mark-complete guard, which is
   * driven by the same numbers.
   */
  it('carries an unknown entry count through as null, not zero', () => {
    const snapshot = buildSecretaryCockpitSnapshot({
      showId: 'show-1',
      trials: [
        {
          id: 'trial-1',
          showId: 'show-1',
          showName: 'Show',
          name: 'Sunday AM',
          trialDate: '2026-07-20',
          trialNumber: '2',
          status: 'In Progress',
          order: '2',
          _version: 1,
          _lastModified: new Date(),
          _lastModifiedBy: 'user-1',
          _syncStatus: 'synced',
        },
      ],
      classes: [
        {
          id: 'class-1',
          trialId: 'trial-1',
          name: 'Container Novice',
          time: '10:00',
          status: 'In Progress',
          entryCount: null,
          scoredCount: null,
        },
      ],
      tree,
      pendingSignals: [],
      returnTo: '/shows/show-1/show-desk',
      now: new Date('2026-07-20T15:10:00.000Z'),
    });

    const cls = snapshot.classes[0];
    expect(cls?.entryCount).toBeNull();
    expect(cls?.scoredCount).toBeNull();
  });

  it('still carries a real zero through as zero', () => {
    const snapshot = buildSecretaryCockpitSnapshot({
      showId: 'show-1',
      trials: [
        {
          id: 'trial-1',
          showId: 'show-1',
          showName: 'Show',
          name: 'Sunday AM',
          trialDate: '2026-07-20',
          trialNumber: '2',
          status: 'In Progress',
          order: '2',
          _version: 1,
          _lastModified: new Date(),
          _lastModifiedBy: 'user-1',
          _syncStatus: 'synced',
        },
      ],
      classes: [
        {
          id: 'class-1',
          trialId: 'trial-1',
          name: 'Container Novice',
          time: '10:00',
          status: 'In Progress',
          entryCount: 0,
          scoredCount: 0,
        },
      ],
      tree,
      pendingSignals: [],
      returnTo: '/shows/show-1/show-desk',
      now: new Date('2026-07-20T15:10:00.000Z'),
    });

    const cls = snapshot.classes[0];
    expect(cls?.entryCount).toBe(0);
    expect(cls?.scoredCount).toBe(0);
  });

  it('groups by Trial, preserves scheduled time, and adds canonical class work links', () => {
    const snapshot = buildSecretaryCockpitSnapshot({
      showId: 'show-1',
      trials: [
        {
          id: 'trial-1',
          showId: 'show-1',
          showName: 'Show',
          name: 'Sunday AM',
          trialDate: '2026-07-20',
          trialNumber: '2',
          status: 'In Progress',
          order: '2',
          _version: 1,
          _lastModified: new Date(),
          _lastModifiedBy: 'user-1',
          _syncStatus: 'synced',
        },
      ],
      classes: [
        {
          id: 'class-1',
          trialId: 'trial-1',
          name: 'Container Novice',
          time: '10:00',
          revisedExpectedStart: '2026-07-20T15:15:00.000Z',
          status: 'In Progress',
          entryCount: 12,
          scoredCount: 10,
        },
      ],
      tree,
      pendingSignals: [],
      returnTo: '/shows/show-1/show-desk?focus=class-1',
      now: new Date('2026-07-20T15:10:00.000Z'),
    });

    expect(snapshot.trials[0]).toMatchObject({ number: '2', date: '2026-07-20', order: 2 });
    expect(snapshot.classes[0]).toMatchObject({
      lifecycle: 'in-progress',
      scheduledStart: '10:00',
      revisedExpectedStart: '2026-07-20T15:15:00.000Z',
    });
    expect(snapshot.classes[0]?.actions.map(action => action.label)).toEqual(
      expect.arrayContaining([
        'Enter paper scores',
        'View entries and results',
        // F29b phase 2a: was 'Run order and class setup'. It pointed at Manage
        // Classes, which has no run-order control; run order now lives on the
        // focused-class panel and this link keeps only what it delivers.
        'Class setup',
        'Class reports',
      ])
    );
    expect(
      snapshot.classes[0]?.actions.find(action => action.label === 'View entries and results')
    ).toMatchObject({
      destination: { kind: 'href', href: expect.stringContaining('/classes/class-1') },
    });
  });
});
