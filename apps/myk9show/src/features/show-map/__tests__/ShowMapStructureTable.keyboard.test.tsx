import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import {
  buildShowMapTree,
  getDefaultExpandedNodeIds,
  getTrialsExpandedNodeIds,
} from '../showMapTree';
import { ShowMapStructureTable } from '../ShowMapStructureTable';
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

const activeClass = {
  id: 'class-1',
  trialId: 'trial-1',
  name: 'Interior Novice A',
  status: 'In Progress',
} satisfies ShowMapClassInput;

const entry = {
  id: 'entry-1',
  class_id: 'class-1',
  armband: '12',
  dog: { call_name: 'Bella' },
} satisfies ShowMapEntryInput;

function getTreeItem(nodeId: string): HTMLElement {
  const row = document.querySelector(`[data-node-id="${nodeId}"]`);
  if (!(row instanceof HTMLElement)) throw new Error(`Expected treeitem ${nodeId}`);
  return row;
}

function expectRovingTabStop(activeNodeId: string): void {
  const treeitems = screen.getAllByRole('treeitem');
  expect(treeitems.filter(row => row.getAttribute('tabindex') === '0')).toHaveLength(1);
  expect(getTreeItem(activeNodeId)).toHaveAttribute('tabindex', '0');
}

describe('ShowMapStructureTable keyboard tree navigation', () => {
  it('uses one roving tab stop and moves through visible rows with Arrow keys', async () => {
    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes: [activeClass],
      entries: [entry],
    });

    const { user } = render(
      <ShowMapStructureTable
        tree={tree}
        expandedNodeIds={new Set(Object.keys(tree.nodesById))}
        filter="all"
        onToggle={vi.fn()}
      />
    );

    expectRovingTabStop('trial:trial-1');

    await user.tab();
    expect(getTreeItem('trial:trial-1')).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(getTreeItem('class:class-1')).toHaveFocus();
    expectRovingTabStop('class:class-1');

    await user.keyboard('{ArrowDown}');
    expect(getTreeItem('entry:entry-1')).toHaveFocus();
    expectRovingTabStop('entry:entry-1');

    await user.keyboard('{ArrowUp}');
    expect(getTreeItem('class:class-1')).toHaveFocus();

    await user.keyboard('{Home}');
    expect(getTreeItem('trial:trial-1')).toHaveFocus();

    await user.keyboard('{End}');
    expect(getTreeItem('entry:entry-1')).toHaveFocus();
  });

  it('keeps Enter opening row actions from the currently focused roving row', async () => {
    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes: [activeClass],
      entries: [entry],
    });
    const onAction = vi.fn();
    const onNavigate = vi.fn();

    const { user } = render(
      <ShowMapStructureTable
        tree={tree}
        expandedNodeIds={new Set(Object.keys(tree.nodesById))}
        filter="all"
        onToggle={vi.fn()}
        onAction={onAction}
        onNavigate={onNavigate}
      />
    );

    await user.tab();
    await user.keyboard('{ArrowDown}');
    expect(getTreeItem('class:class-1')).toHaveFocus();

    await user.keyboard('{Enter}');

    expect(await screen.findAllByRole('menuitem', { name: /score class/i })).not.toHaveLength(0);
    expect(onAction).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('uses ArrowRight and ArrowLeft for tree expansion and parent movement', async () => {
    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes: [activeClass],
      entries: [entry],
    });
    const onToggle = vi.fn();

    const { user, rerender } = render(
      <ShowMapStructureTable
        tree={tree}
        expandedNodeIds={getDefaultExpandedNodeIds(tree)}
        filter="all"
        onToggle={onToggle}
      />
    );

    await user.tab();
    await user.keyboard('{ArrowRight}');
    expect(onToggle).toHaveBeenCalledWith('trial:trial-1');

    rerender(
      <ShowMapStructureTable
        tree={tree}
        expandedNodeIds={getTrialsExpandedNodeIds(tree)}
        filter="all"
        onToggle={onToggle}
      />
    );

    expect(getTreeItem('trial:trial-1')).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(getTreeItem('class:class-1')).toHaveFocus();

    await user.keyboard('{ArrowLeft}');
    expect(getTreeItem('trial:trial-1')).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    await user.keyboard('{ArrowRight}');
    expect(onToggle).toHaveBeenCalledWith('class:class-1');
  });
});
