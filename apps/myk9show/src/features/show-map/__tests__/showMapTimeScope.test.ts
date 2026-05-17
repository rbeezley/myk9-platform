import { describe, expect, it } from 'vitest';
import { buildShowMapTree } from '../showMapTree';
import {
  getNodeDayBucket,
  isDimmedByDayScope,
  nodeMatchesCompletionScope,
  nodeMatchesDayScope,
} from '../showMapTimeScope';
import type { Show } from '@/types/show-types';
import type { SyncableTrial } from '@/store/trial-store-types';

const show = { id: 'show-1', name: 'Spring Trial' } as Show;

function makeTrial(overrides: Partial<SyncableTrial>): SyncableTrial {
  return {
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
    ...overrides,
  } as SyncableTrial;
}

describe('showMapTimeScope', () => {
  it('classifies trial dates in the trial timezone', () => {
    const now = new Date('2026-05-18T03:30:00.000Z');
    const tree = buildShowMapTree({
      show,
      trials: [makeTrial({ trialDate: '2026-05-17', timezone: 'America/New_York' })],
      classes: [],
      entries: [],
    });
    const trialNode = tree.nodesById['trial:trial-1'];
    if (!trialNode) throw new Error('Expected trial node');

    expect(getNodeDayBucket(tree, trialNode, now)).toBe('today');
    expect(nodeMatchesDayScope(tree, trialNode, 'today', now)).toBe(true);
    expect(nodeMatchesDayScope(tree, trialNode, 'tomorrow', now)).toBe(false);
  });

  it('honors non-eastern trial timezones', () => {
    const now = new Date('2026-05-18T06:30:00.000Z');
    const tree = buildShowMapTree({
      show,
      trials: [makeTrial({ trialDate: '2026-05-17', timezone: 'America/Los_Angeles' })],
      classes: [],
      entries: [],
    });
    const trialNode = tree.nodesById['trial:trial-1'];
    if (!trialNode) throw new Error('Expected trial node');

    expect(getNodeDayBucket(tree, trialNode, now)).toBe('today');
    expect(nodeMatchesDayScope(tree, trialNode, 'today', now)).toBe(true);
  });

  it('matches tomorrow and dims non-today rows in All dates scope', () => {
    const now = new Date('2026-05-17T15:00:00.000Z');
    const tree = buildShowMapTree({
      show,
      trials: [makeTrial({ trialDate: '2026-05-18' })],
      classes: [],
      entries: [],
    });
    const trialNode = tree.nodesById['trial:trial-1'];
    if (!trialNode) throw new Error('Expected trial node');

    expect(getNodeDayBucket(tree, trialNode, now)).toBe('tomorrow');
    expect(nodeMatchesDayScope(tree, trialNode, 'tomorrow', now)).toBe(true);
    expect(
      isDimmedByDayScope(tree, trialNode, { dayScope: 'all', completionScope: 'active' }, now)
    ).toBe(true);
  });

  it('separates active and completed nodes', () => {
    const tree = buildShowMapTree({
      show,
      trials: [makeTrial({})],
      classes: [
        {
          id: 'class-complete',
          trialId: 'trial-1',
          name: 'Interior Novice A',
          status: 'Complete',
        },
      ],
      entries: [],
    });
    const classNode = tree.nodesById['class:class-complete'];
    if (!classNode) throw new Error('Expected class node');

    expect(nodeMatchesCompletionScope(classNode, 'active')).toBe(false);
    expect(nodeMatchesCompletionScope(classNode, 'completed')).toBe(true);
  });

  it('keeps checked-in entries active until their run status is complete', () => {
    const tree = buildShowMapTree({
      show,
      trials: [makeTrial({})],
      classes: [
        {
          id: 'class-1',
          trialId: 'trial-1',
          name: 'Interior Novice A',
          status: 'In Progress',
        },
      ],
      entries: [
        {
          id: 'entry-1',
          class_id: 'class-1',
          dog: { call_name: 'Bella' },
          check_in_status: 'checked-in',
        },
      ],
    });
    const entryNode = tree.nodesById['entry:entry-1'];
    if (!entryNode) throw new Error('Expected entry node');

    expect(nodeMatchesCompletionScope(entryNode, 'active')).toBe(true);
    expect(nodeMatchesCompletionScope(entryNode, 'completed')).toBe(false);
  });
});
