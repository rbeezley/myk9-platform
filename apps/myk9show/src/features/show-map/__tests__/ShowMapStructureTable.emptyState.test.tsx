import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { buildShowMapTree } from '../showMapTree';
import { ShowMapStructureTable } from '../ShowMapStructureTable';
import type { Show } from '@/types/show-types';
import type { SyncableTrial } from '@/store/trial-store-types';
import type { ShowMapClassInput } from '../showMapTypes';

const show = {
  id: 'show-1',
  name: 'Spring Trial',
  clubName: 'Calm Canine Club',
  organization: 'AKC',
} as Show;

const trial = {
  id: 'trial-1',
  showId: 'show-1',
  showName: 'Spring Trial',
  trialDate: '2026-05-11',
  trialNumber: '1',
  status: 'In Progress',
  _version: 1,
  _lastModified: new Date(),
  _lastModifiedBy: 'test',
  _syncStatus: 'synced',
} as SyncableTrial;

const cleanClasses: ShowMapClassInput[] = [
  {
    id: 'class-1',
    trialId: 'trial-1',
    name: 'Interior Novice A',
    status: 'Not Started',
  },
];

describe('ShowMapStructureTable filtered empty state', () => {
  it('keeps All Exhibitors and matching dog ancestors visible under needs-attention filter', () => {
    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes: cleanClasses,
      entries: [
        {
          id: 'entry-1',
          class_id: 'class-1',
          dog_id: 'dog-1',
          dog: { id: 'dog-1', call_name: 'Bella' },
          entry_status: 'submitted',
        },
      ],
    });
    const expandedNodeIds = new Set([tree.root.id, 'all-exhibitors:show-1', 'dog:dog-1']);

    render(
      <ShowMapStructureTable
        tree={tree}
        expandedNodeIds={expandedNodeIds}
        filter="needs-attention"
        onToggle={vi.fn()}
      />
    );

    expect(screen.getByText('All Exhibitors')).toBeInTheDocument();
    expect(screen.getByText('Bella')).toBeInTheDocument();
    expect(screen.getByText('Interior Novice A')).toBeInTheDocument();
  });

  it('renders the empty state when the filter hides every row', () => {
    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes: cleanClasses,
      entries: [],
    });

    render(
      <ShowMapStructureTable
        tree={tree}
        expandedNodeIds={new Set(Object.keys(tree.nodesById))}
        filter="needs-attention"
        onToggle={vi.fn()}
        onResetFilters={vi.fn()}
      />
    );

    expect(screen.getByText('Nothing matches your current filters.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reset filters/i })).toBeInTheDocument();
    expect(screen.queryByText('Trial 1')).not.toBeInTheDocument();
    expect(screen.queryByRole('tree')).not.toBeInTheDocument();
  });

  it('does not render the empty state when the underlying tree has no trials', () => {
    const tree = buildShowMapTree({
      show,
      trials: [],
      classes: [],
      entries: [],
    });

    render(
      <ShowMapStructureTable
        tree={tree}
        expandedNodeIds={new Set(Object.keys(tree.nodesById))}
        filter="needs-attention"
        onToggle={vi.fn()}
        onResetFilters={vi.fn()}
      />
    );

    expect(screen.queryByText('Nothing matches your current filters.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reset filters/i })).not.toBeInTheDocument();
  });

  it('invokes the reset callback when "Reset filters" is clicked', async () => {
    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes: cleanClasses,
      entries: [],
    });
    const onResetFilters = vi.fn();

    const { user } = render(
      <ShowMapStructureTable
        tree={tree}
        expandedNodeIds={new Set(Object.keys(tree.nodesById))}
        filter="needs-attention"
        onToggle={vi.fn()}
        onResetFilters={onResetFilters}
      />
    );

    await user.click(screen.getByRole('button', { name: /reset filters/i }));
    expect(onResetFilters).toHaveBeenCalledTimes(1);
  });

  it('renders the empty state when the scope (not filter) hides every row', () => {
    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes: cleanClasses,
      entries: [],
    });

    render(
      <ShowMapStructureTable
        tree={tree}
        expandedNodeIds={new Set(Object.keys(tree.nodesById))}
        filter="all"
        scope={{ dayScope: 'tomorrow', completionScope: 'completed' }}
        scopeNow={new Date('2026-05-11T12:00:00Z')}
        onToggle={vi.fn()}
        onResetFilters={vi.fn()}
      />
    );

    expect(screen.getByText('Nothing matches your current filters.')).toBeInTheDocument();
    expect(screen.queryByRole('tree')).not.toBeInTheDocument();
  });

  it('omits the reset button when no reset callback is provided', () => {
    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes: cleanClasses,
      entries: [],
    });

    render(
      <ShowMapStructureTable
        tree={tree}
        expandedNodeIds={new Set(Object.keys(tree.nodesById))}
        filter="needs-attention"
        onToggle={vi.fn()}
      />
    );

    expect(screen.getByText('Nothing matches your current filters.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reset filters/i })).not.toBeInTheDocument();
  });
});
