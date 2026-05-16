// Attention counts must stay synchronized across the dashboard strip and the
// show-map tree — same dataset, same total. Without this assertion, the two
// surfaces can drift silently when their classification logic is edited
// independently.
import { describe, expect, it } from 'vitest';
import { buildShowMapTree } from '../showMapTree';
import { countAttention, type EntryLike } from '../attention';
import type { Show } from '@/types/show-types';
import type { SyncableTrial } from '@/store/trial-store-types';
import type { ShowMapClassInput } from '../showMapTypes';

const show: Show = {
  id: 'show-1',
  name: 'Divergence Show',
  clubId: 'club-1',
  startDate: '2026-05-20',
  endDate: '2026-05-20',
  status: 'published',
} as unknown as Show;

const trials: SyncableTrial[] = [
  {
    id: 'trial-1',
    showId: 'show-1',
    name: 'Trial A',
    trialNumber: '1',
    trialDate: '2026-05-20',
    status: 'not-started',
  } as unknown as SyncableTrial,
];

const classes: ShowMapClassInput[] = [
  { id: 'class-1', trialId: 'trial-1', name: 'Novice A' },
  { id: 'class-2', trialId: 'trial-1', name: 'Novice B' },
];

// Mixed dataset spanning every relevant status combination.
const entries: EntryLike[] = [
  // 3 pending_review only (entry_status='submitted', no check-in conflict)
  { entry_status: 'submitted' },
  { entry_status: 'submitted' },
  { entry_status: 'submitted' },
  // 2 check_in_conflict only (different entry_status)
  { entry_status: 'accepted', check_in_status: 'conflict' },
  { entry_status: 'confirmed', check_in_status: 'conflict' },
  // 1 row that matches BOTH — should count as check_in_conflict (higher priority)
  { entry_status: 'submitted', check_in_status: 'conflict' },
  // Noise: rows that should not contribute
  { entry_status: 'accepted', check_in_status: 'checked-in' },
  { entry_status: 'completed' },
  { entry_status: 'withdrawn' },
  { entry_status: 'scratched' },
  { entry_status: 'no-status' },
];

// Distribute entries across classes so the tree sees them.
const treeEntries = entries.map((e, i) => ({
  ...e,
  id: `entry-${i}`,
  class_id: i % 2 === 0 ? 'class-1' : 'class-2',
}));

describe('attention divergence prevention', () => {
  it('show-map tree root attentionCount equals countAttention() over the same dataset', () => {
    const tree = buildShowMapTree({ show, trials, classes, entries: treeEntries });
    const dashboardCounts = countAttention(treeEntries);

    // Sanity: the fixture exercises both reasons + the priority tiebreak.
    expect(dashboardCounts.pending_review).toBe(3);
    expect(dashboardCounts.check_in_conflict).toBe(3);
    expect(dashboardCounts.total).toBe(6);

    expect(tree.root.attentionCount).toBe(dashboardCounts.total);
  });

  it('per-class attentionCount sums to the show root', () => {
    const tree = buildShowMapTree({ show, trials, classes, entries: treeEntries });
    const classNodes = Object.values(tree.nodesById).filter(n => n.type === 'class');
    const summed = classNodes.reduce((acc, n) => acc + (n.attentionCount ?? 0), 0);
    expect(summed).toBe(tree.root.attentionCount);
  });
});
