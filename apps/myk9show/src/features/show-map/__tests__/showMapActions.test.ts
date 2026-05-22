import { describe, expect, it } from 'vitest';
import { buildShowMapTree } from '../showMapTree';
import {
  getAttentionActions,
  getPrimaryActionForNode,
  getRankedActions,
  getRecommendedActions,
  SHOW_MAP_RECOMMENDED_ACTION_LIMIT,
  showMapBadgeTargets,
} from '../showMapActions';
import type { Show } from '@/types/show-types';
import type { SyncableTrial } from '@/store/trial-store-types';
import type { ShowMapClassInput } from '../showMapTypes';
import type { ShowMapActionId } from '../showMapActions';

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
    id: 'class-active',
    trialId: 'trial-1',
    name: 'Interior Novice A',
    status: 'In Progress',
  },
  {
    id: 'class-future',
    trialId: 'trial-1',
    name: 'Exterior Advanced B',
    status: 'Not Started',
  },
];

function findAction(actions: ReturnType<typeof getRankedActions>, id: ShowMapActionId) {
  const action = actions.find(candidate => candidate.id === id);
  expect(action, `expected ${id} action`).toBeDefined();
  return action!;
}

describe('showMapActions', () => {
  it('documents the canonical badge targets by row type', () => {
    expect(showMapBadgeTargets.trial).toEqual([
      'registry',
      'date',
      'ring/judge',
      'status',
      'reports-readiness',
    ]);
    expect(showMapBadgeTargets.class).toContain('checked-in count');
    expect(showMapBadgeTargets.entry).toContain('score status');
  });

  it('ranks urgent entry attention above ordinary class actions', () => {
    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes,
      entries: [
        {
          id: 'entry-conflict',
          class_id: 'class-active',
          dog: { call_name: 'Bella' },
          check_in_status: 'conflict',
        },
      ],
    });

    const actions = getRankedActions('root', { tree });

    expect(actions[0]).toMatchObject({
      id: 'resolve-check-in-conflict',
      nodeId: 'entry:entry-conflict',
      label: 'Resolve check-in conflict',
      href: '/shows/show-1/trials/trial-1/classes/class-active',
    });
    expect(actions.map(action => action.id)).toContain('score-class');
  });

  it('caps recommended actions at two in deterministic ranked order', () => {
    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes,
      entries: [
        {
          id: 'entry-conflict',
          class_id: 'class-active',
          dog: { call_name: 'Bella' },
          check_in_status: 'conflict',
        },
        {
          id: 'entry-submitted',
          class_id: 'class-future',
          dog: { call_name: 'Scout' },
          entry_status: 'submitted',
        },
      ],
    });

    const allRecommendedActions = getRecommendedActions(
      'root',
      { tree },
      Number.POSITIVE_INFINITY
    );
    const recommendedActions = getRecommendedActions('root', { tree });

    expect(allRecommendedActions.length).toBeGreaterThan(SHOW_MAP_RECOMMENDED_ACTION_LIMIT);
    expect(recommendedActions).toHaveLength(SHOW_MAP_RECOMMENDED_ACTION_LIMIT);
    expect(recommendedActions).toEqual([
      expect.objectContaining({
        id: 'resolve-check-in-conflict',
        why: 'Entry has a check-in conflict',
      }),
      expect.objectContaining({
        id: 'review-entry',
        why: 'Entry is waiting for secretary review',
      }),
    ]);
  });

  it('exposes only human-attention actions for the Attention lens', () => {
    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes,
      entries: [
        {
          id: 'entry-submitted',
          class_id: 'class-future',
          dog: { call_name: 'Scout' },
          entry_status: 'submitted',
        },
      ],
    });

    const attentionActions = getAttentionActions('root', { tree });

    expect(attentionActions).toHaveLength(1);
    expect(attentionActions[0]).toMatchObject({
      id: 'review-entry',
      nodeId: 'entry:entry-submitted',
      label: 'Review entry',
    });
  });

  it('does not treat generic pending entry statuses as Attention lens work', () => {
    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes,
      entries: [
        {
          id: 'entry-pending',
          class_id: 'class-future',
          dog: { call_name: 'Scout' },
          entry_status: 'pending',
        },
      ],
    });

    expect(getAttentionActions('root', { tree })).toEqual([]);
  });

  it('uses Score Class only as the primary action for active classes', () => {
    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes,
      entries: [],
    });

    expect(getPrimaryActionForNode(tree.nodesById['class:class-active'], { tree })).toMatchObject({
      id: 'score-class',
      label: 'Score Class',
    });
    expect(getPrimaryActionForNode(tree.nodesById['class:class-future'], { tree })).toMatchObject({
      id: 'print-check-in-sheet',
      label: 'Print Check-In Sheet',
    });
  });

  it('emits class lifecycle quick actions only for matching class states', () => {
    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes: [
        ...classes,
        {
          id: 'class-complete',
          trialId: 'trial-1',
          name: 'Buried Excellent',
          status: 'Complete',
        },
      ],
      entries: [],
    });

    expect(findAction(getRankedActions(tree.nodesById['class:class-future'], { tree }), 'mark-class-started')).toMatchObject({
      label: 'Mark Class Started',
      classId: 'class-future',
      trialId: 'trial-1',
      recommended: true,
    });
    expect(getRankedActions(tree.nodesById['class:class-future'], { tree }).map(action => action.id)).not.toContain(
      'mark-class-complete'
    );

    expect(findAction(getRankedActions(tree.nodesById['class:class-active'], { tree }), 'mark-class-complete')).toMatchObject({
      label: 'Mark Class Complete',
      classId: 'class-active',
      trialId: 'trial-1',
    });
    expect(getRankedActions(tree.nodesById['class:class-active'], { tree }).map(action => action.id)).not.toContain(
      'mark-class-started'
    );

    const completedActionIds = getRankedActions(tree.nodesById['class:class-complete'], {
      tree,
    }).map(action => action.id);
    expect(completedActionIds).not.toContain('mark-class-started');
    expect(completedActionIds).not.toContain('mark-class-complete');
  });

  it('uses verified destinations for class open, score, and print actions', () => {
    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes,
      entries: [],
    });

    const actions = getRankedActions(tree.nodesById['class:class-active'], { tree });

    expect(findAction(actions, 'open-class')).toMatchObject({
      href: '/shows/show-1/trials/trial-1/classes/class-active',
    });
    expect(findAction(actions, 'score-class')).toMatchObject({
      href: '/scoring/classes/class-active/entries?mode=split',
    });
    expect(findAction(actions, 'print-check-in-sheet')).toMatchObject({
      href: '/secretary/reports?report=check-in-sheet&showId=show-1&trialId=trial-1&classId=class-active',
    });
  });

  it('uses verified destinations for trial schedule and report actions', () => {
    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes,
      entries: [],
    });

    const actions = getRankedActions(tree.nodesById['trial:trial-1'], { tree });

    expect(findAction(actions, 'open-schedule')).toMatchObject({
      href: '/secretary/shows/show-1?phase=setup',
    });
    expect(findAction(actions, 'print-trial-reports')).toMatchObject({
      href: '/secretary/reports?report=trial-secretary-report&showId=show-1&trialId=trial-1',
    });
  });

  it('emits mark checked-in only for entries that still need check-in', () => {
    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes: [classes[0]!],
      entries: [
        {
          id: 'entry-needs-check-in',
          class_id: 'class-active',
          dog: { call_name: 'Bella' },
          check_in_status: 'no-status',
        },
        {
          id: 'entry-already-checked-in',
          class_id: 'class-active',
          dog: { call_name: 'Scout' },
          check_in_status: 'checked-in',
        },
      ],
    });

    const actions = getRankedActions('root', { tree }).filter(
      action => action.id === 'mark-checked-in'
    );

    expect(actions).toEqual([
      expect.objectContaining({
        nodeId: 'entry:entry-needs-check-in',
        classId: 'class-active',
      }),
    ]);
  });

  it('emits message handler only when the entry has a handler id', () => {
    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes: [classes[0]!],
      entries: [
        {
          id: 'entry-with-handler',
          class_id: 'class-active',
          dog: { call_name: 'Bella' },
          handler: 'Jane Handler',
          handler_id: 'person-1',
        },
        {
          id: 'entry-without-handler',
          class_id: 'class-active',
          dog: { call_name: 'Scout' },
        },
      ],
    });

    const actions = getRankedActions('root', { tree }).filter(
      action => action.id === 'message-handler'
    );

    expect(actions).toEqual([
      expect.objectContaining({
        nodeId: 'entry:entry-with-handler',
      }),
    ]);
  });

  it('keeps wrap-up attention actions out of the default Today action set', () => {
    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes: [
        {
          id: 'class-needs-signature',
          trialId: 'trial-1',
          name: 'Container Novice A',
          status: 'Complete',
        },
      ],
      entries: [
        {
          id: 'entry-needs-signature',
          class_id: 'class-needs-signature',
          is_scored: true,
        },
      ],
    });

    expect(getRankedActions('root', { tree }).map(action => action.id)).not.toContain(
      'collect-judge-signature'
    );
    expect(getRankedActions('root', { tree, phase: 'wrap-up' })).toEqual([
      expect.objectContaining({
        id: 'collect-judge-signature',
        nodeId: 'class:class-needs-signature',
        href: '/secretary/reports',
        createsAttention: true,
      }),
    ]);
  });

  it('uses the shared phase-aware contract for recommended actions', () => {
    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes: [
        {
          id: 'class-needs-signature',
          trialId: 'trial-1',
          name: 'Container Novice A',
          status: 'Complete',
        },
      ],
      entries: [
        {
          id: 'entry-needs-signature',
          class_id: 'class-needs-signature',
          is_scored: true,
        },
      ],
    });

    expect(getRecommendedActions('root', { tree }).map(action => action.id)).not.toContain(
      'collect-judge-signature'
    );
    expect(getRecommendedActions('root', { tree, phase: 'wrap-up' })).toEqual([
      expect.objectContaining({
        id: 'collect-judge-signature',
        why: 'Completed class still needs judge sign-off',
      }),
    ]);
  });

  it('keeps disabled navigation actions out of the recommended contract', () => {
    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes: [classes[1]!],
      entries: [],
    });
    const classNode = tree.nodesById['class:class-future'];
    if (!classNode) throw new Error('Expected future class node');
    const classWithoutTrial = { ...classNode, parentId: undefined };

    const printAction = findAction(
      getRankedActions(classWithoutTrial, { tree }),
      'print-check-in-sheet'
    );

    expect(printAction).toMatchObject({
      recommended: true,
    });
    expect(printAction.href).toBeUndefined();
    expect(getRecommendedActions(classWithoutTrial, { tree })).not.toContainEqual(
      expect.objectContaining({ id: 'print-check-in-sheet' })
    );
  });

  it('treats unsigned and unsubmitted completed classes as wrap-up attention work', () => {
    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes: [
        {
          id: 'class-signed',
          trialId: 'trial-1',
          name: 'Container Novice A',
          status: 'Complete',
        },
      ],
      entries: [
        {
          id: 'entry-signed',
          class_id: 'class-signed',
          is_scored: true,
          judge_signature_timestamp: '2026-05-18',
        },
      ],
    });

    expect(getAttentionActions('root', { tree, phase: 'wrap-up' })).toEqual([
      expect.objectContaining({
        id: 'review-results',
        nodeId: 'class:class-signed',
        href: '/secretary/results-control',
      }),
      expect.objectContaining({
        id: 'submit-final-results',
        nodeId: 'trial:trial-1',
        href: '/secretary/results-submission',
      }),
    ]);
  });
});
