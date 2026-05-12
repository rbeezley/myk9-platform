import { describe, expect, it, vi } from 'vitest';
import { buildShowMapLayout, getInitialExpandedNodeIds } from '../showMapLayout';
import { buildShowMapTree } from '../showMapTree';
import type { Show } from '@/types/show-types';
import type { SyncableTrial } from '@/store/trial-store-types';

const show = { id: 'show-1', name: 'Spring Trial' } as Show;
const trial = {
  id: 'trial-1',
  showId: 'show-1',
  showName: 'Spring Trial',
  trialDate: '2026-05-11',
  trialNumber: '1',
  status: 'Scheduled',
  _version: 1,
  _lastModified: new Date(),
  _lastModifiedBy: 'test',
  _syncStatus: 'synced',
} as SyncableTrial;

describe('showMapLayout', () => {
  it('omits descendants for collapsed branches', () => {
    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes: [{ id: 'class-1', trialId: 'trial-1', name: 'Interior Novice', status: 'Scheduled' }],
      entries: [{ id: 'entry-1', class_id: 'class-1', dog: { call_name: 'Bella' } }],
    });

    const layout = buildShowMapLayout(tree, new Set([tree.root.id]), {
      onToggle: vi.fn(),
    });

    expect(layout.nodes.map(node => node.id)).toEqual(['show:show-1', 'trial:trial-1']);
    expect(layout.edges.map(edge => edge.id)).toEqual(['show:show-1->trial:trial-1']);
  });

  it('is deterministic with default trial expansion', () => {
    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes: [{ id: 'class-1', trialId: 'trial-1', name: 'Interior Novice', status: 'Completed' }],
      entries: [],
    });

    const expanded = getInitialExpandedNodeIds(tree);
    const first = buildShowMapLayout(tree, expanded, { onToggle: vi.fn() });
    const second = buildShowMapLayout(tree, expanded, { onToggle: vi.fn() });

    expect(first.nodes.map(node => node.position)).toEqual(second.nodes.map(node => node.position));
  });

  it('keeps matching descendants with their parent context when filtering', () => {
    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes: [
        { id: 'class-1', trialId: 'trial-1', name: 'Interior Novice', status: 'Scheduled' },
        { id: 'class-2', trialId: 'trial-1', name: 'Exterior Novice', status: 'Scheduled' },
      ],
      entries: [
        {
          id: 'entry-1',
          class_id: 'class-1',
          entry_status: 'accepted',
          check_in_status: 'conflict',
          dog: { call_name: 'Bella' },
        },
      ],
    });

    const expanded = getInitialExpandedNodeIds(tree);
    expanded.add('class:class-1');
    const layout = buildShowMapLayout(tree, expanded, {
      filter: 'needs-attention',
      onToggle: vi.fn(),
    });

    expect(layout.nodes.map(node => node.id)).toEqual([
      'show:show-1',
      'trial:trial-1',
      'class:class-1',
      'entry:entry-1',
    ]);
    expect(layout.nodes.some(node => node.id === 'class:class-2')).toBe(false);
    expect(layout.nodes.find(node => node.id === 'entry:entry-1')?.data.isFilteredOut).toBe(false);
  });
});
