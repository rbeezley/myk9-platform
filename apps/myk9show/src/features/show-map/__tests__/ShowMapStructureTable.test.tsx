import { fireEvent, screen } from '@testing-library/react';
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

const classes: ShowMapClassInput[] = [
  {
    id: 'class-attention',
    trialId: 'trial-1',
    name: 'Interior Novice A',
    status: 'In Progress',
  },
  {
    id: 'class-complete',
    trialId: 'trial-1',
    name: 'Exterior Advanced B',
    status: 'Complete',
  },
];

function getTreeItemForText(text: string): HTMLElement {
  const row = screen.getByText(text).closest('[role="treeitem"]');
  if (!(row instanceof HTMLElement)) throw new Error(`Expected treeitem for ${text}`);
  return row;
}

describe('ShowMapStructureTable', () => {
  it('keeps parent context when filtering to entries that need attention', () => {
    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes,
      entries: [
        {
          id: 'entry-attention',
          class_id: 'class-attention',
          dog_id: 'dog-12',
          handler_id: 'person-12',
          armband: '12',
          handler: 'Jane Handler',
          dog: {
            call_name: 'Bella',
            breed: 'Mixed Breed',
            registrations: [{ organization: 'AKC', breed: 'Labrador Retriever' }],
          },
          entry_status: 'submitted',
        },
        {
          id: 'entry-complete',
          class_id: 'class-complete',
          armband: '14',
          dog: { call_name: 'Scout' },
          is_scored: true,
        },
      ],
    });

    render(
      <ShowMapStructureTable
        tree={tree}
        expandedNodeIds={new Set(Object.keys(tree.nodesById))}
        filter="needs-attention"
        onToggle={vi.fn()}
      />
    );

    expect(screen.getByText('Trial 1')).toBeInTheDocument();
    expect(document.querySelector('[data-node-id="class:class-attention"]')).not.toBeNull();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('Bella')).toBeInTheDocument();
    expect(screen.getByText('Labrador Retriever')).toBeInTheDocument();
    expect(screen.getByText('Jane Handler')).toBeInTheDocument();
    expect(screen.queryByText('Exterior Advanced B')).not.toBeInTheDocument();
    expect(screen.queryByText('Scout')).not.toBeInTheDocument();
  });

  it('renders submitted entry leaves in the Attention lens through the action contract', () => {
    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes,
      entries: [
        {
          id: 'entry-submitted',
          class_id: 'class-attention',
          armband: '15',
          dog: { call_name: 'Riley' },
          entry_status: 'submitted',
        },
      ],
    });

    render(
      <ShowMapStructureTable
        tree={tree}
        expandedNodeIds={new Set(Object.keys(tree.nodesById))}
        filter="needs-attention"
        onToggle={vi.fn()}
      />
    );

    expect(document.querySelector('[data-node-id="class:class-attention"]')).not.toBeNull();
    expect(screen.getByText('Riley')).toBeInTheDocument();
  });

  it('renders expanded All Exhibitors dog rows and dog-entry class context', () => {
    const attentionClass = classes[0];
    if (!attentionClass) throw new Error('Expected an attention class fixture');

    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes: [
        {
          ...attentionClass,
          ring: 2,
          judgeName: 'Judge Judy',
          time: '09:30',
        },
      ],
      entries: [
        {
          id: 'entry-1',
          class_id: attentionClass.id,
          dog_id: 'dog-1',
          armband: '12',
          handler: 'Jane Handler',
          dog: { id: 'dog-1', call_name: 'Bella', breed: 'Labrador Retriever' },
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

    expect(screen.getByText('All Exhibitors')).toBeInTheDocument();
    expect(screen.getByText('#12 Bella')).toBeInTheDocument();
    expect(screen.getByText('Jane Handler · Labrador Retriever')).toBeInTheDocument();
    expect(screen.getByText('Interior Novice A')).toBeInTheDocument();
    expect(
      screen.getByText('Spring Trial · 2026-05-11 · Ring 2 · Judge Judy · 09:30')
    ).toBeInTheDocument();
  });

  it('links expanded entry dog and handler names to their detail pages', async () => {
    const attentionClass = classes[0];
    if (!attentionClass) throw new Error('Expected an attention class fixture');

    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes: [attentionClass],
      entries: [
        {
          id: 'entry-1',
          class_id: 'class-attention',
          dog_id: 'dog-12',
          handler_id: 'person-12',
          armband: '12',
          handler: 'Jane Handler',
          dog: { id: 'dog-12', call_name: 'Bella', breed: 'Labrador Retriever' },
        },
      ],
    });
    const onNavigate = vi.fn();

    const { user } = render(
      <ShowMapStructureTable
        tree={tree}
        expandedNodeIds={new Set(Object.keys(tree.nodesById))}
        filter="all"
        onToggle={vi.fn()}
        onNavigate={onNavigate}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Bella' }));
    expect(onNavigate).toHaveBeenCalledWith('/dogs/dog-12');

    await user.click(screen.getByRole('button', { name: 'Jane Handler' }));
    expect(onNavigate).toHaveBeenCalledWith('/people/person-12');
  });

  it('collapses class rows while keeping class-level scoring available', async () => {
    const attentionClass = classes[0];
    if (!attentionClass) throw new Error('Expected an attention class fixture');

    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes: [attentionClass],
      entries: [
        {
          id: 'entry-1',
          class_id: 'class-attention',
          armband: '12',
          handler: 'Jane Handler',
          handler_id: 'person-1',
          dog: { call_name: 'Bella' },
        },
      ],
    });
    // Simulate the secretary clicking "Expand trials" so the class row is
    // visible but its entries are still collapsed.
    const expandedNodeIds = getTrialsExpandedNodeIds(tree);
    const onToggle = vi.fn();
    const onNavigate = vi.fn();

    const { user } = render(
      <ShowMapStructureTable
        tree={tree}
        expandedNodeIds={expandedNodeIds}
        filter="all"
        onToggle={onToggle}
        onNavigate={onNavigate}
      />
    );

    expect(screen.queryByText('Bella')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /open/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /score class/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /score class/i }));
    expect(onNavigate).toHaveBeenCalledWith('/scoring/classes/class-attention/entries?mode=split');

    await user.click(screen.getByRole('button', { name: /expand interior novice a/i }));

    expect(onToggle).toHaveBeenCalledWith('class:class-attention');
  });

  it('surfaces Mark Class Started as the inline primary for not-started classes (Pattern 3)', async () => {
    const futureClass = {
      id: 'class-future',
      trialId: 'trial-1',
      name: 'Exterior Advanced B',
      status: 'Not Started',
    };
    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes: [futureClass],
      entries: [],
    });
    const onNavigate = vi.fn();
    const onAction = vi.fn();

    const { user } = render(
      <ShowMapStructureTable
        tree={tree}
        expandedNodeIds={getTrialsExpandedNodeIds(tree)}
        filter="all"
        onToggle={vi.fn()}
        onNavigate={onNavigate}
        onAction={onAction}
      />
    );

    expect(screen.queryByRole('button', { name: /score class/i })).not.toBeInTheDocument();

    // The inline primary is the lifecycle's next step — a mutation action,
    // not a navigation. Pre-B2b, the primary picker filtered mutations out
    // and fell back to Print Check-In Sheet (priority 45) instead.
    const markStartedButton = screen.getByRole('button', { name: /mark class started/i });
    await user.click(markStartedButton);

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction.mock.calls[0]?.[0]).toMatchObject({
      id: 'mark-class-started',
      classId: 'class-future',
    });
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('defaults to root-only expansion so class rows are hidden until a trial is opened', () => {
    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes,
      entries: [
        {
          id: 'entry-1',
          class_id: 'class-attention',
          armband: '12',
          handler: 'Jane Handler',
          handler_id: 'person-1',
          dog: { call_name: 'Bella' },
        },
      ],
    });

    // Default expansion: only the root. Trial rows are rendered (top-level
    // children of root), but their class children remain hidden.
    const expandedNodeIds = getDefaultExpandedNodeIds(tree);
    expect(expandedNodeIds).toEqual(new Set([tree.root.id]));

    render(
      <ShowMapStructureTable
        tree={tree}
        expandedNodeIds={expandedNodeIds}
        filter="all"
        onToggle={vi.fn()}
      />
    );

    expect(screen.getByText('Trial 1')).toBeInTheDocument();
    expect(screen.queryByText('Interior Novice A')).not.toBeInTheDocument();
    expect(screen.queryByText('Exterior Advanced B')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /score class/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Bella')).not.toBeInTheDocument();
  });

  it('shows recommended row actions from the shared ranked action contract', async () => {
    const attentionClass = classes[0];
    if (!attentionClass) throw new Error('Expected an attention class fixture');

    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes: [attentionClass],
      entries: [
        {
          id: 'entry-1',
          class_id: 'class-attention',
          armband: '12',
          dog: { call_name: 'Bella' },
          entry_status: 'submitted',
        },
      ],
    });

    const { user } = render(
      <ShowMapStructureTable
        tree={tree}
        expandedNodeIds={new Set(Object.keys(tree.nodesById))}
        filter="all"
        onToggle={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: /actions for .*bella/i }));

    expect(await screen.findByText('Recommended')).toBeInTheDocument();
    expect(screen.getAllByText('Review entry').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/Entry is waiting for secretary review/)).toBeInTheDocument();
  });

  it('opens the same row actions menu from right-clicking row whitespace', async () => {
    const attentionClass = classes[0];
    if (!attentionClass) throw new Error('Expected an attention class fixture');

    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes: [attentionClass],
      entries: [
        {
          id: 'entry-1',
          class_id: 'class-attention',
          armband: '12',
          dog: { call_name: 'Bella' },
          entry_status: 'submitted',
        },
      ],
    });

    render(
      <ShowMapStructureTable
        tree={tree}
        expandedNodeIds={new Set(Object.keys(tree.nodesById))}
        filter="all"
        onToggle={vi.fn()}
      />
    );

    const row = screen.getByText('Bella').closest('[data-row-action-surface]');
    if (!(row instanceof HTMLElement)) throw new Error('Expected entry row');

    fireEvent.contextMenu(row);
    expect(await screen.findByText('Recommended')).toBeInTheDocument();
    expect(screen.getByText(/Entry is waiting for secretary review/)).toBeInTheDocument();
  });

  it('opens the entry row actions menu from Enter without executing an action', async () => {
    const attentionClass = classes[0];
    if (!attentionClass) throw new Error('Expected an attention class fixture');

    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes: [attentionClass],
      entries: [
        {
          id: 'entry-1',
          class_id: 'class-attention',
          armband: '12',
          dog: { call_name: 'Bella' },
          entry_status: 'submitted',
        },
      ],
    });
    const onAction = vi.fn();
    const onNavigate = vi.fn();

    render(
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

    expect(await screen.findByText('Recommended')).toBeInTheDocument();
    expect(screen.getByText(/Entry is waiting for secretary review/)).toBeInTheDocument();
    expect(onAction).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('opens the class row actions menu from Space without executing an action', async () => {
    const attentionClass = classes[0];
    if (!attentionClass) throw new Error('Expected an attention class fixture');

    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes: [attentionClass],
      entries: [],
    });
    const onAction = vi.fn();
    const onNavigate = vi.fn();

    render(
      <ShowMapStructureTable
        tree={tree}
        expandedNodeIds={getTrialsExpandedNodeIds(tree)}
        filter="all"
        onToggle={vi.fn()}
        onAction={onAction}
        onNavigate={onNavigate}
      />
    );

    fireEvent.keyDown(getTreeItemForText('Interior Novice A'), { key: ' ' });

    expect(await screen.findAllByRole('menuitem', { name: /score class/i })).not.toHaveLength(0);
    expect(onAction).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('opens the trial row actions menu from keyboard focus without executing an action', async () => {
    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes: [],
      entries: [],
    });
    const onAction = vi.fn();
    const onNavigate = vi.fn();

    const { user } = render(
      <ShowMapStructureTable
        tree={tree}
        expandedNodeIds={getTrialsExpandedNodeIds(tree)}
        filter="all"
        onToggle={vi.fn()}
        onAction={onAction}
        onNavigate={onNavigate}
      />
    );

    const trialRow = getTreeItemForText('Trial 1');
    await user.tab();
    expect(trialRow).toHaveFocus();

    await user.keyboard('{Enter}');

    expect(await screen.findAllByRole('menuitem', { name: /open schedule/i })).not.toHaveLength(
      0
    );
    expect(onAction).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('does not open row actions when keyboard events start in nested row controls', () => {
    const attentionClass = classes[0];
    if (!attentionClass) throw new Error('Expected an attention class fixture');

    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes: [attentionClass],
      entries: [
        {
          id: 'entry-1',
          class_id: 'class-attention',
          armband: '12',
          dog_id: 'dog-12',
          dog: { id: 'dog-12', call_name: 'Bella' },
        },
      ],
    });
    const onAction = vi.fn();
    const onNavigate = vi.fn();

    render(
      <ShowMapStructureTable
        tree={tree}
        expandedNodeIds={new Set(Object.keys(tree.nodesById))}
        filter="all"
        onToggle={vi.fn()}
        onAction={onAction}
        onNavigate={onNavigate}
      />
    );

    fireEvent.keyDown(screen.getByRole('button', { name: 'Bella' }), { key: 'Enter' });
    fireEvent.keyDown(screen.getByRole('button', { name: /collapse interior novice a/i }), {
      key: ' ',
    });

    expect(screen.queryByText('Recommended')).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
    expect(onAction).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('executes mark checked-in through the shared action executor', async () => {
    const attentionClass = classes[0];
    if (!attentionClass) throw new Error('Expected an attention class fixture');

    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes: [attentionClass],
      entries: [
        {
          id: 'entry-1',
          class_id: 'class-attention',
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

    await user.click(screen.getByRole('button', { name: /actions for .*bella/i }));
    await user.click(await screen.findByRole('menuitem', { name: /mark checked in/i }));

    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'mark-checked-in',
        nodeId: 'entry:entry-1',
        classId: 'class-attention',
      }),
      {
        kind: 'mutation',
        mutation: 'mark-checked-in',
        successMessage: 'Entry checked in',
      }
    );
  });

  it('executes scratch / no-show through the shared dialog executor', async () => {
    const attentionClass = classes[0];
    if (!attentionClass) throw new Error('Expected an attention class fixture');

    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes: [attentionClass],
      entries: [
        {
          id: 'entry-1',
          class_id: 'class-attention',
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

    await user.click(screen.getByRole('button', { name: /actions for .*bella/i }));
    await user.click(await screen.findByRole('menuitem', { name: /scratch \/ no-show/i }));

    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'scratch-entry',
        nodeId: 'entry:entry-1',
        classId: 'class-attention',
      }),
      {
        kind: 'dialog',
        dialog: 'scratch-entry',
      }
    );
  });

  it('executes move-up through the shared dialog executor', async () => {
    const attentionClass = classes[0];
    if (!attentionClass) throw new Error('Expected an attention class fixture');

    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes: [attentionClass],
      entries: [
        {
          id: 'entry-1',
          class_id: 'class-attention',
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

    await user.click(screen.getByRole('button', { name: /actions for .*bella/i }));
    await user.click(await screen.findByRole('menuitem', { name: /move up/i }));

    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'move-up-entry',
        nodeId: 'entry:entry-1',
        classId: 'class-attention',
      }),
      {
        kind: 'dialog',
        dialog: 'move-up-entry',
      }
    );
  });

  it('executes message handler through the shared dialog executor', async () => {
    const attentionClass = classes[0];
    if (!attentionClass) throw new Error('Expected an attention class fixture');

    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes: [attentionClass],
      entries: [
        {
          id: 'entry-1',
          class_id: 'class-attention',
          armband: '12',
          handler: 'Jane Handler',
          handler_id: 'person-1',
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

    await user.click(screen.getByRole('button', { name: /actions for .*bella/i }));
    await user.click(await screen.findByRole('menuitem', { name: /message handler/i }));

    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'message-handler',
        nodeId: 'entry:entry-1',
      }),
      {
        kind: 'dialog',
        dialog: 'message-handler',
      }
    );
  });
});
