import { describe, expect, it } from 'vitest';
import { buildShowMapTree } from '../showMapTree';
import { nodeMatchesCompletionScope } from '../showMapTimeScope';
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
