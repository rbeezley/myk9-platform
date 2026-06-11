import { describe, expect, it } from 'vitest';
import { ClipboardList, ListTree } from 'lucide-react';
import { buildShowMapTree } from '../showMapTree';
import { groupActionsByEntity } from '../showMapActionGroups';
import { getRankedActions } from '../showMapActions';
import type { ShowMapAction } from '../showMapActions';
import type { ShowMapClassInput, ShowMapTree } from '../showMapTypes';
import type { Show } from '@/types/show-types';
import type { SyncableTrial } from '@/store/trial-store-types';

const show = {
  id: 'show-1',
  name: 'Heritage',
  clubName: 'Test Club',
  organization: 'AKC',
} as Show;

const trial = {
  id: 'trial-1',
  showId: 'show-1',
  showName: 'Heritage',
  trialDate: '2026-06-12',
  trialNumber: '1',
  status: 'Not Started',
  _version: 1,
  _lastModified: new Date(),
  _lastModifiedBy: 'test',
  _syncStatus: 'synced',
} as SyncableTrial;

const classes: ShowMapClassInput[] = [
  { id: 'class-a', trialId: 'trial-1', name: 'Container Novice', status: 'Not Started' },
  { id: 'class-b', trialId: 'trial-1', name: 'Interior Novice', status: 'Not Started' },
  { id: 'class-c', trialId: 'trial-1', name: 'Exterior Novice', status: 'Not Started' },
];

function makeBravoTree(): ShowMapTree {
  return buildShowMapTree({
    show,
    trials: [trial],
    classes,
    entries: [
      {
        id: 'entry-bravo-a',
        class_id: 'class-a',
        dog_id: 'dog-bravo',
        dog: { id: 'dog-bravo', call_name: 'Bravo' },
        handler_name: 'Test Secretary',
        armband: '100',
        entry_status: 'submitted',
      },
      {
        id: 'entry-bravo-b',
        class_id: 'class-b',
        dog_id: 'dog-bravo',
        dog: { id: 'dog-bravo', call_name: 'Bravo' },
        handler_name: 'Test Secretary',
        armband: '100',
        entry_status: 'submitted',
      },
      {
        id: 'entry-bravo-c',
        class_id: 'class-c',
        dog_id: 'dog-bravo',
        dog: { id: 'dog-bravo', call_name: 'Bravo' },
        handler_name: 'Test Secretary',
        armband: '100',
        entry_status: 'submitted',
      },
      {
        id: 'entry-ace',
        class_id: 'class-a',
        dog_id: 'dog-ace',
        dog: { id: 'dog-ace', call_name: 'Ace' },
        handler_name: 'Test Secretary',
        armband: '101',
        entry_status: 'submitted',
      },
    ],
  });
}

function fakeAction(overrides: Partial<ShowMapAction>): ShowMapAction {
  return {
    id: 'review-entry',
    nodeId: 'entry:e-1',
    label: 'Review entry',
    why: 'Test',
    priority: 80,
    icon: ClipboardList,
    ...overrides,
  } as ShowMapAction;
}

describe('groupActionsByEntity', () => {
  it('returns an empty list for empty input', () => {
    const tree = makeBravoTree();
    expect(groupActionsByEntity([], tree)).toEqual([]);
  });

  it('returns a size-1 group for a single action', () => {
    const tree = makeBravoTree();
    const actions = getRankedActions('root', { tree }).filter(
      a => a.nodeId === 'entry:entry-ace'
    );
    expect(actions.length).toBeGreaterThan(0);
    const groups = groupActionsByEntity(actions.slice(0, 1), tree);
    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(1);
    expect(groups[0].items).toHaveLength(1);
  });

  it('collapses same-dog same-action entries into one group with class disambiguator per item', () => {
    const tree = makeBravoTree();
    const reviewActions = getRankedActions('root', { tree }).filter(
      a => a.id === 'review-entry'
    );
    expect(reviewActions.length).toBe(4);

    const groups = groupActionsByEntity(reviewActions, tree);

    // 4 review actions (3 Bravo + 1 Ace) collapse to 2 groups (one per dog).
    expect(groups).toHaveLength(2);
    const bravoGroup = groups.find(g => g.count === 3);
    const aceGroup = groups.find(g => g.count === 1);
    expect(bravoGroup).toBeDefined();
    expect(aceGroup).toBeDefined();

    const disambiguators = bravoGroup!.items.map(i => i.disambiguator).sort();
    expect(disambiguators).toEqual(['Container Novice', 'Exterior Novice', 'Interior Novice']);
  });

  it('collapses capped dog-entry review actions by dog with class disambiguators', () => {
    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes,
      entryPreviewLimit: 1,
      entries: [
        {
          id: 'entry-visible-a',
          class_id: 'class-a',
          dog_id: 'dog-visible-a',
          run_order: 1,
          dog: { id: 'dog-visible-a', call_name: 'Visible A' },
          armband: '99',
          entry_status: 'accepted',
        },
        {
          id: 'entry-bravo-a',
          class_id: 'class-a',
          dog_id: 'dog-bravo',
          run_order: 2,
          dog: { id: 'dog-bravo', call_name: 'Bravo' },
          armband: '100',
          entry_status: 'submitted',
        },
        {
          id: 'entry-visible-b',
          class_id: 'class-b',
          dog_id: 'dog-visible-b',
          run_order: 1,
          dog: { id: 'dog-visible-b', call_name: 'Visible B' },
          armband: '98',
          entry_status: 'accepted',
        },
        {
          id: 'entry-bravo-b',
          class_id: 'class-b',
          dog_id: 'dog-bravo',
          run_order: 2,
          dog: { id: 'dog-bravo', call_name: 'Bravo' },
          armband: '100',
          entry_status: 'submitted',
        },
      ],
    });
    expect(tree.nodesById['entry:entry-bravo-a']).toBeUndefined();
    expect(tree.nodesById['entry:entry-bravo-b']).toBeUndefined();

    const reviewActions = getRankedActions('root', { tree }).filter(
      a => a.id === 'review-entry'
    );
    expect(reviewActions.map(action => action.nodeId).sort()).toEqual([
      'dog-entry:entry-bravo-a',
      'dog-entry:entry-bravo-b',
    ]);

    const groups = groupActionsByEntity(reviewActions, tree);

    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('review-entry:dog:dog-bravo');
    expect(groups[0].count).toBe(2);
    expect(groups[0].items.map(item => item.disambiguator).sort()).toEqual([
      'Container Novice',
      'Interior Novice',
    ]);
  });

  it('does not collapse the same dog across different action types', () => {
    const tree = makeBravoTree();
    const reviewBravoA = fakeAction({
      id: 'review-entry',
      nodeId: 'entry:entry-bravo-a',
    });
    const messageBravoB = fakeAction({
      id: 'message-handler',
      nodeId: 'entry:entry-bravo-b',
      label: 'Message handler',
    });
    const groups = groupActionsByEntity([reviewBravoA, messageBravoB], tree);
    expect(groups).toHaveLength(2);
    expect(groups[0].representative.id).toBe('review-entry');
    expect(groups[1].representative.id).toBe('message-handler');
  });

  it('preserves the priority order of the first action seen for each group', () => {
    const tree = makeBravoTree();
    const reviewBravoA = fakeAction({
      id: 'review-entry',
      nodeId: 'entry:entry-bravo-a',
      priority: 85,
    });
    const reviewAce = fakeAction({
      id: 'review-entry',
      nodeId: 'entry:entry-ace',
      priority: 84,
    });
    const reviewBravoB = fakeAction({
      id: 'review-entry',
      nodeId: 'entry:entry-bravo-b',
      priority: 83,
    });
    // Order: Bravo-A, Ace, Bravo-B → expect Bravo group (started at idx 0) before Ace group.
    const groups = groupActionsByEntity([reviewBravoA, reviewAce, reviewBravoB], tree);
    expect(groups.map(g => g.representative.nodeId)).toEqual([
      'entry:entry-bravo-a',
      'entry:entry-ace',
    ]);
    expect(groups[0].count).toBe(2);
    expect(groups[1].count).toBe(1);
  });

  it('treats non-entry actions as their own size-1 groups', () => {
    const tree = makeBravoTree();
    const classAction = fakeAction({
      id: 'score-class',
      nodeId: 'class:class-a',
      label: 'Score class',
      icon: ListTree,
    });
    const otherClassAction = fakeAction({
      id: 'score-class',
      nodeId: 'class:class-b',
      label: 'Score class',
      icon: ListTree,
    });
    const groups = groupActionsByEntity([classAction, otherClassAction], tree);
    expect(groups).toHaveLength(2);
    expect(groups.every(g => g.count === 1)).toBe(true);
  });

  it('does not collapse entry actions whose nodes lack a dogId', () => {
    // Bypass the normal tree builder so we can produce an entry node without dogId.
    const tree: ShowMapTree = {
      root: {
        id: 'show:show-1',
        type: 'show',
        label: 'Heritage',
        childrenCount: 0,
      },
      nodesById: {
        'show:show-1': {
          id: 'show:show-1',
          type: 'show',
          label: 'Heritage',
          childrenCount: 0,
        },
        'class:class-a': {
          id: 'class:class-a',
          type: 'class',
          label: 'Container Novice',
          parentId: 'show:show-1',
          childrenCount: 2,
        },
        'entry:no-dogid-1': {
          id: 'entry:no-dogid-1',
          type: 'entry',
          label: '#1',
          parentId: 'class:class-a',
          childrenCount: 0,
          entryDisplay: { dogName: 'Unknown' },
        },
        'entry:no-dogid-2': {
          id: 'entry:no-dogid-2',
          type: 'entry',
          label: '#2',
          parentId: 'class:class-a',
          childrenCount: 0,
          entryDisplay: { dogName: 'Unknown' },
        },
      },
      childIdsByParentId: {
        'show:show-1': ['class:class-a'],
        'class:class-a': ['entry:no-dogid-1', 'entry:no-dogid-2'],
      },
    };
    const a1 = fakeAction({ id: 'review-entry', nodeId: 'entry:no-dogid-1' });
    const a2 = fakeAction({ id: 'review-entry', nodeId: 'entry:no-dogid-2' });
    const groups = groupActionsByEntity([a1, a2], tree);
    expect(groups).toHaveLength(2);
    expect(groups.every(g => g.count === 1)).toBe(true);
  });
});
