import { screen } from '@testing-library/react';
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

    // Each rendered node is a treeitem (trial + class + entry = 3)
    const treeitems = screen.getAllByRole('treeitem');
    expect(treeitems).toHaveLength(3);

    // Nested ULs are groups (trial → classes, class → entries = 2 groups)
    const groups = screen.getAllByRole('group');
    expect(groups).toHaveLength(2);

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
