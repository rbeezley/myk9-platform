/**
 * F29b phase 1 — `entryPreviewLimit` was declared on `UseShowMapWorkbenchStateInput`
 * and then dropped: the hook called `buildShowMapTree({ show, trials, classes,
 * entries })` and never forwarded it. A caller asking for a fuller tree silently got
 * the 25-entry default.
 *
 * That cap is a TREE-RENDERING concern (ShowMapTab's table). Show Desk reads the tree
 * for actions and counts and never renders it, so the cap truncated two things there:
 * move-up was offered for a class's first 25 entries only, and the attention count
 * missed `review-entry` on every pending entry past the 25th.
 *
 * This pins the forwarding. The sibling test in
 * `cockpit/secretaryCockpitEntryRows.test.tsx` builds its own tree, so it proves the
 * BUILDER honours the limit — not that any caller asks for it. Removing the limit
 * from ShowDeskPanel left that test green, which is why this one exists.
 */
import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { createTestQueryClient } from '@/test/utils/testUtils';

import { useShowMapWorkbenchState } from './useShowMapWorkbenchState';

const SHOW = {
  id: 'show-1',
  name: 'Heartland',
  organization: 'AKC',
  startDate: '2026-07-20',
  endDate: '2026-07-20',
} as unknown as Parameters<typeof useShowMapWorkbenchState>[0]['show'];

const TRIALS = [
  { id: 'trial-1', showId: 'show-1', trialDate: '2026-07-20', trialNumber: '1', name: 'Trial 1' },
] as unknown as Parameters<typeof useShowMapWorkbenchState>[0]['trials'];

const CLASSES = [
  {
    id: 'class-1',
    trialId: 'trial-1',
    name: 'Container Novice A',
    element: 'Container',
    level: 'Novice',
    section: 'A',
    status: 'scheduled',
    classOrder: 1,
  },
] as unknown as Parameters<typeof useShowMapWorkbenchState>[0]['classes'];

/** Above DEFAULT_ENTRY_PREVIEW_LIMIT (25) so the cap is observable. */
const ENTRY_COUNT = 30;
const ENTRIES = Array.from({ length: ENTRY_COUNT }, (_, i) => ({
  id: `entry-${i + 1}`,
  class_id: 'class-1',
  show_id: 'show-1',
  armband: String(101 + i),
  entry_status: 'confirmed',
  check_in_status: 'checked-in',
  dog: { id: `dog-${i + 1}`, call_name: `Dog ${i + 1}`, name: `Dog ${i + 1}` },
})) as unknown as Parameters<typeof useShowMapWorkbenchState>[0]['entries'];

// The hook calls useNavigate and reads React Query state, so it needs both providers.
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={createTestQueryClient()}>
    <MemoryRouter>{children}</MemoryRouter>
  </QueryClientProvider>
);

function countEntryNodes(tree: { nodesById: Record<string, { type: string }> }): number {
  return Object.values(tree.nodesById).filter(node => node.type === 'entry').length;
}

describe('useShowMapWorkbenchState entryPreviewLimit', () => {
  it('forwards the limit to buildShowMapTree', () => {
    const { result } = renderHook(() =>
      useShowMapWorkbenchState({
        show: SHOW,
        trials: TRIALS,
        classes: CLASSES,
        entries: ENTRIES,
        showId: 'show-1',
        entryPreviewLimit: Number.POSITIVE_INFINITY,
      } as unknown as Parameters<typeof useShowMapWorkbenchState>[0]), { wrapper }
    );

    expect(countEntryNodes(result.current.tree)).toBe(ENTRY_COUNT);
  });

  it('still caps at the default when no limit is given', () => {
    // The default protects the Show Map table from rendering hundreds of rows.
    const { result } = renderHook(() =>
      useShowMapWorkbenchState({
        show: SHOW,
        trials: TRIALS,
        classes: CLASSES,
        entries: ENTRIES,
        showId: 'show-1',
      } as unknown as Parameters<typeof useShowMapWorkbenchState>[0]), { wrapper }
    );

    expect(countEntryNodes(result.current.tree)).toBe(25);
  });
});
