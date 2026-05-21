import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { ShowMapRowActionsMenu } from '../ShowMapRowActionsMenu';
import { ShowMapStructureTable } from '../ShowMapStructureTable';
import { buildShowMapTree, getTrialsExpandedNodeIds } from '../showMapTree';
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

const classReadyForCheckIn = {
  id: 'class-future',
  trialId: 'trial-1',
  name: 'Exterior Advanced B',
  status: 'Not Started',
} satisfies ShowMapClassInput;

const classInProgress = {
  id: 'class-active',
  trialId: 'trial-1',
  name: 'Interior Novice A',
  status: 'In Progress',
} satisfies ShowMapClassInput;

function getTreeItemForText(text: string): HTMLElement {
  const row = screen.getByText(text).closest('[role="treeitem"]');
  if (!(row instanceof HTMLElement)) throw new Error(`Expected treeitem for ${text}`);
  return row;
}

describe('ShowMap row actions closeout regression', () => {
  it('uses the three-dot trigger for a navigate action', async () => {
    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes: [classReadyForCheckIn],
      entries: [],
    });
    const onNavigate = vi.fn();

    const { user } = render(
      <ShowMapStructureTable
        tree={tree}
        expandedNodeIds={getTrialsExpandedNodeIds(tree)}
        filter="all"
        onToggle={vi.fn()}
        onNavigate={onNavigate}
      />
    );

    await user.click(screen.getByRole('button', { name: /actions for exterior advanced b/i }));
    const printActions = await screen.findAllByRole('menuitem', {
      name: /print check-in sheet/i,
    });
    const printAction = printActions[0];
    if (!printAction) throw new Error('Expected Print Check-In Sheet action');
    await user.click(printAction);

    expect(onNavigate).toHaveBeenCalledWith(
      '/secretary/reports?report=check-in-sheet&showId=show-1&trialId=trial-1&classId=class-future'
    );
  });

  it('uses right-click row whitespace for a mutation action', async () => {
    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes: [classInProgress],
      entries: [
        {
          id: 'entry-1',
          class_id: 'class-active',
          armband: '12',
          dog: { call_name: 'Bella' },
        },
      ],
    });
    const onAction = vi.fn();

    const { user } = render(
      <ShowMapStructureTable
        tree={tree}
        expandedNodeIds={new Set(Object.keys(tree.nodesById))}
        filter="all"
        onToggle={vi.fn()}
        onAction={onAction}
      />
    );

    const row = screen.getByText('Bella').closest('[data-row-action-surface]');
    if (!(row instanceof HTMLElement)) throw new Error('Expected entry row');

    fireEvent.contextMenu(row);
    await user.click(await screen.findByRole('menuitem', { name: /mark checked in/i }));

    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'mark-checked-in',
        nodeId: 'entry:entry-1',
        classId: 'class-active',
      }),
      {
        kind: 'mutation',
        mutation: 'mark-checked-in',
        successMessage: 'Entry checked in',
      }
    );
  });

  it('uses keyboard row open for a dialog action without auto-executing it', async () => {
    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes: [classInProgress],
      entries: [
        {
          id: 'entry-1',
          class_id: 'class-active',
          armband: '12',
          dog: { call_name: 'Bella' },
        },
      ],
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

    fireEvent.keyDown(getTreeItemForText('Bella'), { key: 'Enter' });

    expect(
      await screen.findByRole('menuitem', { name: /scratch \/ no-show/i })
    ).toBeInTheDocument();
    expect(onAction).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();

    await user.click(screen.getByRole('menuitem', { name: /scratch \/ no-show/i }));

    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'scratch-entry',
        nodeId: 'entry:entry-1',
        classId: 'class-active',
      }),
      {
        kind: 'dialog',
        dialog: 'scratch-entry',
      }
    );
  });

  it('keeps missing-destination navigation disabled', async () => {
    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes: [classReadyForCheckIn],
      entries: [],
    });
    const classNode = tree.nodesById['class:class-future'];
    if (!classNode) throw new Error('Expected future class node');
    const classWithoutTrial = { ...classNode, parentId: undefined };
    const onAction = vi.fn();
    const onNavigate = vi.fn();

    const { user } = render(
      <ShowMapRowActionsMenu
        node={classWithoutTrial}
        tree={tree}
        onAction={onAction}
        onNavigate={onNavigate}
      />
    );

    await user.click(screen.getByRole('button', { name: /actions for exterior advanced b/i }));

    expect(await screen.findByRole('menu')).toBeInTheDocument();
    expect(screen.getByText('No destination is available for this action.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('menuitem', { name: /print check-in sheet/i }));

    expect(onAction).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
  });
});
