import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { buildShowMapTree } from '../showMapTree';
import { ShowMapStructureTable } from '../ShowMapStructureTable';
import ShowMapTab from '../ShowMapTab';
import type { Show } from '@/types/show-types';
import type { SyncableTrial } from '@/store/trial-store-types';
import type { ShowMapClassInput, ShowMapEntryInput } from '../showMapTypes';

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

const baseClass: ShowMapClassInput = {
  id: 'class-1',
  trialId: 'trial-1',
  name: 'Interior Novice A',
  status: 'In Progress',
};

const baseEntry: ShowMapEntryInput = {
  id: 'entry-1',
  class_id: 'class-1',
  armband: '12',
  dog: { call_name: 'Bella' },
};

function buildExpandedAll(treeInput: Parameters<typeof buildShowMapTree>[0]) {
  const tree = buildShowMapTree(treeInput);
  return { tree, expandedNodeIds: new Set(Object.keys(tree.nodesById)) };
}

describe('ShowMapStructureTable — data-node-id / data-node-type / ARIA', () => {
  it('renders data-node-id and data-node-type on trial / class / entry rows', () => {
    const { tree, expandedNodeIds } = buildExpandedAll({
      show,
      trials: [trial],
      classes: [baseClass],
      entries: [baseEntry],
    });

    render(
      <ShowMapStructureTable
        tree={tree}
        expandedNodeIds={expandedNodeIds}
        filter="all"
        onToggle={vi.fn()}
      />
    );

    const trialRow = document.querySelector('[data-node-id="trial:trial-1"]');
    expect(trialRow).not.toBeNull();
    expect(trialRow?.getAttribute('data-node-type')).toBe('trial');

    const classRow = document.querySelector('[data-node-id="class:class-1"]');
    expect(classRow).not.toBeNull();
    expect(classRow?.getAttribute('data-node-type')).toBe('class');

    const entryRow = document.querySelector('[data-node-id="entry:entry-1"]');
    expect(entryRow).not.toBeNull();
    expect(entryRow?.getAttribute('data-node-type')).toBe('entry');
  });

  it('renders data-node-type="more" on the synthetic overflow row', () => {
    const extraEntries: ShowMapEntryInput[] = Array.from({ length: 3 }, (_, i) => ({
      id: `entry-${i}`,
      class_id: 'class-1',
      armband: String(i + 10),
      dog: { call_name: `Dog ${i}` },
    }));
    const { tree, expandedNodeIds } = buildExpandedAll({
      show,
      trials: [trial],
      classes: [baseClass],
      entries: extraEntries,
      entryPreviewLimit: 1,
    });

    render(
      <ShowMapStructureTable
        tree={tree}
        expandedNodeIds={expandedNodeIds}
        filter="all"
        onToggle={vi.fn()}
      />
    );

    const moreRow = document.querySelector('[data-node-type="more"]');
    expect(moreRow).not.toBeNull();
    expect(moreRow?.getAttribute('data-node-id')).toBe('more:class-1');
  });

  it('adds data-node attributes and ARIA levels for all exhibitors branch rows', () => {
    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes: [baseClass],
      entries: [
        {
          id: 'entry-1',
          class_id: 'class-1',
          dog_id: 'dog-1',
          dog: { id: 'dog-1', call_name: 'Bella' },
        },
      ],
    });

    render(
      <ShowMapStructureTable
        tree={tree}
        expandedNodeIds={new Set([tree.root.id, 'all-exhibitors:show-1', 'dog:dog-1'])}
        filter="all"
        onToggle={vi.fn()}
      />
    );

    const allExhibitorsRow = screen.getByText('All Exhibitors').closest('[role="treeitem"]');
    const dogRow = screen.getByText('Bella').closest('[role="treeitem"]');
    const dogEntryRow = screen.getByText('Interior Novice A').closest('[role="treeitem"]');

    expect(allExhibitorsRow).toHaveAttribute('data-node-id', 'all-exhibitors:show-1');
    expect(allExhibitorsRow).toHaveAttribute('data-node-type', 'all-exhibitors');
    expect(allExhibitorsRow).toHaveAttribute('aria-level', '1');

    expect(dogRow).toHaveAttribute('data-node-id', 'dog:dog-1');
    expect(dogRow).toHaveAttribute('data-node-type', 'dog');
    expect(dogRow).toHaveAttribute('aria-level', '2');

    expect(dogEntryRow).toHaveAttribute('data-node-id', 'dog-entry:entry-1');
    expect(dogEntryRow).toHaveAttribute('data-node-type', 'dog-entry');
    expect(dogEntryRow).toHaveAttribute('aria-level', '3');
  });

  it('exposes ARIA tree semantics: tree, treeitem, group, aria-expanded, aria-level', () => {
    const { tree, expandedNodeIds } = buildExpandedAll({
      show,
      trials: [trial],
      classes: [baseClass],
      entries: [baseEntry],
    });

    render(
      <ShowMapStructureTable
        tree={tree}
        expandedNodeIds={expandedNodeIds}
        filter="all"
        onToggle={vi.fn()}
      />
    );

    // Outer container is a tree
    expect(screen.getAllByRole('tree')).toHaveLength(1);

    // Each rendered node is a treeitem (all exhibitors + dog + dog-entry + trial + class + entry)
    const treeitems = screen.getAllByRole('treeitem');
    expect(treeitems).toHaveLength(6);

    // Nested ULs are groups (all exhibitors → dogs, dog → dog-entry, trial → classes, class → entries)
    const groups = screen.getAllByRole('group');
    expect(groups).toHaveLength(4);

    // Trial row (has children, expanded) → aria-expanded="true"
    const trialRow = document.querySelector('[data-node-id="trial:trial-1"]');
    expect(trialRow?.getAttribute('aria-expanded')).toBe('true');
    expect(trialRow?.getAttribute('aria-level')).toBe('1');

    // Class row (has children, expanded) → aria-expanded="true"
    const classRow = document.querySelector('[data-node-id="class:class-1"]');
    expect(classRow?.getAttribute('aria-expanded')).toBe('true');
    expect(classRow?.getAttribute('aria-level')).toBe('2');

    // Entry row (no children) → aria-expanded must NOT be set
    const entryRow = document.querySelector('[data-node-id="entry:entry-1"]');
    expect(entryRow?.hasAttribute('aria-expanded')).toBe(false);
    expect(entryRow?.getAttribute('aria-level')).toBe('3');
  });

  it('omits aria-expanded on rows without children', () => {
    // Build a tree where the class has no entries → no children
    const { tree, expandedNodeIds } = buildExpandedAll({
      show,
      trials: [trial],
      classes: [baseClass],
      entries: [],
    });

    render(
      <ShowMapStructureTable
        tree={tree}
        expandedNodeIds={expandedNodeIds}
        filter="all"
        onToggle={vi.fn()}
      />
    );

    const classRow = document.querySelector('[data-node-id="class:class-1"]');
    expect(classRow?.hasAttribute('aria-expanded')).toBe(false);
  });

  it('renders browse-only rows when row actions are disabled', () => {
    const onAction = vi.fn();
    const onNavigate = vi.fn();
    const { tree, expandedNodeIds } = buildExpandedAll({
      show,
      trials: [trial],
      classes: [baseClass],
      entries: [
        {
          ...baseEntry,
          check_in_status: 'conflict',
        },
      ],
    });

    render(
      <ShowMapStructureTable
        tree={tree}
        expandedNodeIds={expandedNodeIds}
        filter="all"
        onToggle={vi.fn()}
        onAction={onAction}
        onNavigate={onNavigate}
        enableRowActions={false}
      />
    );

    expect(screen.queryByRole('button', { name: /score class/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /actions for/i })).not.toBeInTheDocument();

    const entryRow = document.querySelector('[data-node-id="entry:entry-1"]');
    const entrySurface = document.querySelector('[data-row-action-surface="entry:entry-1"]');
    if (!(entryRow instanceof HTMLElement) || !(entrySurface instanceof HTMLElement)) {
      throw new Error('Expected entry row and action surface');
    }

    fireEvent.contextMenu(entrySurface);
    fireEvent.keyDown(entryRow, { key: 'Enter' });
    fireEvent.keyDown(entryRow, { key: ' ' });

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(onAction).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
  });
});

describe('ShowMapTab — show-root tile attributes', () => {
  it('renders data-node-id="show:<id>" and data-node-type="show" on the summary tile container', () => {
    render(
      <ShowMapTab
        show={show}
        trials={[trial]}
        classes={[baseClass]}
        entries={[baseEntry]}
        canManageShow={true}
      />
    );

    const tileContainer = document.querySelector('[data-node-id="show:show-1"]');
    expect(tileContainer).not.toBeNull();
    expect(tileContainer?.getAttribute('data-node-type')).toBe('show');
  });
});
