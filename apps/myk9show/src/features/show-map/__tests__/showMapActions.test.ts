import { describe, expect, it } from 'vitest';
import { buildShowMapTree } from '../showMapTree';
import {
  getAttentionActions,
  getAttentionCountsByNodeId,
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

  it('ranks pending-review entry attention above ordinary class actions', () => {
    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes,
      entries: [
        {
          id: 'entry-submitted',
          class_id: 'class-active',
          dog: { call_name: 'Bella' },
          entry_status: 'submitted',
        },
      ],
    });

    const actions = getRankedActions('root', { tree });

    expect(actions[0]).toMatchObject({
      id: 'review-entry',
      nodeId: 'entry:entry-submitted',
      label: 'Review entry',
      href: '/shows/show-1/trials/trial-1/classes/class-active',
    });
    expect(actions.map(action => action.id)).toContain('score-class');
  });

  it('does not surface a secretary action for check_in_status="conflict" (myK9Q owns that signal)', () => {
    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes,
      entries: [
        {
          id: 'entry-conflict-only',
          class_id: 'class-active',
          dog: { call_name: 'Bella' },
          check_in_status: 'conflict',
        },
      ],
    });

    const ids = getRankedActions('root', { tree }).map(action => action.id);

    expect(ids).not.toContain('resolve-check-in-conflict');
    expect(ids).not.toContain('review-entry');
  });

  it('caps recommended actions at two in deterministic ranked order', () => {
    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes,
      entries: [
        {
          id: 'entry-submitted-a',
          class_id: 'class-active',
          dog: { call_name: 'Bella' },
          entry_status: 'submitted',
        },
        {
          id: 'entry-submitted-b',
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
        id: 'review-entry',
        why: 'Bella — Entry is waiting for secretary review',
      }),
      expect.objectContaining({
        id: 'review-entry',
        why: 'Scout — Entry is waiting for secretary review',
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

  it('uses the lifecycle-appropriate primary action for each class state (Pattern 3)', () => {
    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes,
      entries: [],
    });

    // Active class → Score Class (the next operational step).
    expect(getPrimaryActionForNode(tree.nodesById['class:class-active'], { tree })).toMatchObject({
      id: 'score-class',
      label: 'Score Class',
    });
    // Neutral / not-started class → Mark Class Started (the next operational
    // step). Pre-B2b this incorrectly returned Print Check-In Sheet because
    // the primary picker filtered out mutation actions.
    expect(getPrimaryActionForNode(tree.nodesById['class:class-future'], { tree })).toMatchObject({
      id: 'mark-class-started',
      label: 'Mark Class Started',
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

    expect(
      findAction(
        getRankedActions(tree.nodesById['class:class-active'], { tree }),
        'mark-class-complete'
      )
    ).toMatchObject({
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

  it('hides class completion until active class scoring is resolved', () => {
    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes: [
        {
          id: 'class-active',
          trialId: 'trial-1',
          name: 'Interior Novice A',
          status: 'In Progress',
        },
      ],
      entries: [
        {
          id: 'entry-scored',
          class_id: 'class-active',
          dog: { call_name: 'Bella' },
          is_scored: true,
        },
        {
          id: 'entry-unscored',
          class_id: 'class-active',
          dog: { call_name: 'Scout' },
        },
      ],
    });

    const actionIds = getRankedActions(tree.nodesById['class:class-active'], { tree }).map(
      action => action.id
    );

    expect(actionIds).toContain('score-class');
    expect(actionIds).not.toContain('mark-class-complete');
  });

  it('allows empty active classes to be marked complete', () => {
    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes: [
        {
          id: 'class-active',
          trialId: 'trial-1',
          name: 'Interior Novice A',
          status: 'In Progress',
        },
      ],
      entries: [],
    });

    expect(
      findAction(
        getRankedActions(tree.nodesById['class:class-active'], { tree }),
        'mark-class-complete'
      )
    ).toMatchObject({
      label: 'Mark Class Complete',
    });
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

  it('disambiguates entry-scoped action context when several entries stack', () => {
    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes: [classes[0]!],
      entries: [
        {
          id: 'entry-one',
          class_id: 'class-active',
          armband: '101',
          dog: { call_name: 'Bella' },
          handler: 'A. Martin',
          entry_status: 'submitted',
        },
        {
          id: 'entry-two',
          class_id: 'class-active',
          armband: '102',
          dog: { call_name: 'Scout' },
          handler: 'B. Lee',
          entry_status: 'submitted',
        },
      ],
    });

    const reviewActions = getRankedActions('root', { tree }).filter(
      action => action.id === 'review-entry'
    );

    expect(reviewActions).toHaveLength(2);
    expect(reviewActions[0]!.label).toBe('Review entry');
    expect(reviewActions[1]!.label).toBe('Review entry');
    expect(reviewActions[0]!.why).toContain('#101');
    expect(reviewActions[0]!.why).toContain('Bella');
    expect(reviewActions[0]!.why).toContain('A. Martin');
    expect(reviewActions[0]!.why).toContain('Entry is waiting for secretary review');
    expect(reviewActions[1]!.why).toContain('#102');
    expect(reviewActions[1]!.why).toContain('Scout');
    expect(reviewActions[0]!.why).not.toBe(reviewActions[1]!.why);
  });

  it('omits missing entry-context fragments without leaving dangling separators', () => {
    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes: [classes[0]!],
      entries: [
        {
          id: 'entry-bare',
          class_id: 'class-active',
          dog: { call_name: 'Bella' },
          entry_status: 'submitted',
        },
      ],
    });

    const reviewAction = getRankedActions('root', { tree }).find(
      action => action.id === 'review-entry'
    );

    expect(reviewAction).toBeDefined();
    expect(reviewAction!.why).toBe('Bella — Entry is waiting for secretary review');
  });

  it('surfaces wrap-up attention actions in the unified action set', () => {
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

    // B6: actions are always unified. The previous phase='today'/'wrap-up'
    // filter variants were removed alongside the Today and Wrap-up tabs.
    expect(getRankedActions('root', { tree })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'collect-judge-signature',
          nodeId: 'class:class-needs-signature',
          href: '/secretary/reports',
          createsAttention: true,
        }),
      ])
    );
  });

  it('surfaces wrap-up actions in the recommended set', () => {
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

    expect(getRecommendedActions('root', { tree })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'collect-judge-signature',
          why: 'Completed class still needs judge sign-off',
        }),
      ])
    );
  });

  it('merges live-ops and wrap-up actions when phase is undefined (Show Desk unified mode)', () => {
    // A tree where a class is complete & needs judge signature (wrap-up action)
    // AND a different class has a submitted entry (live-ops action). Both
    // actions must surface in the unified Show Desk action set.
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
        {
          id: 'class-active',
          trialId: 'trial-1',
          name: 'Interior Novice A',
          status: 'In Progress',
        },
      ],
      entries: [
        {
          id: 'entry-needs-signature',
          class_id: 'class-needs-signature',
          is_scored: true,
        },
        {
          id: 'entry-submitted',
          class_id: 'class-active',
          dog: { call_name: 'Scout' },
          entry_status: 'submitted',
        },
      ],
    });

    const ids = getRankedActions('root', { tree }).map(action => action.id);

    expect(ids).toContain('collect-judge-signature');
    expect(ids).toContain('review-entry');
  });

  // B6: the phase='today' and phase='wrap-up' filter variants were removed
  // alongside the Today and Wrap-up tabs (see Phase B5). The "merges
  // live-ops and wrap-up actions when phase is undefined" test above
  // covers the only remaining contract — the unified set is always merged.

  it('does not collide when the same node satisfies both a live-ops and a wrap-up action', () => {
    // A class that is `complete` (wrap-up: needs-signature) but the merged
    // emitter must not assign the same action id twice to the same node.
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
      entries: [{ id: 'entry-needs-signature', class_id: 'class-needs-signature', is_scored: true }],
    });

    // Dedup invariant: the assertion would throw if a duplicate (id, nodeId) pair
    // were emitted. Reaching this line means the merge produced unique entries.
    expect(() => getRankedActions('root', { tree })).not.toThrow();
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

    expect(getAttentionActions('root', { tree })).toEqual([
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

  describe('trial-level wrap-up gate (no premature submit-final-results)', () => {
    it('does NOT emit submit-final-results while any class in the trial is still in progress', () => {
      // Regression: pre-fix, a trial defaulted to TRIAL_READY_TO_SUBMIT the
      // moment ANY class completed. A secretary on day 1 of a multi-day trial
      // would see "Submit final results" pointing at the registry submission
      // page while 20 classes were still running.
      const tree = buildShowMapTree({
        show,
        trials: [trial],
        classes: [
          {
            id: 'class-complete',
            trialId: 'trial-1',
            name: 'Container Novice A',
            status: 'Complete',
          },
          {
            id: 'class-still-running',
            trialId: 'trial-1',
            name: 'Interior Novice A',
            status: 'In Progress',
          },
        ],
        entries: [],
      });

      const ids = getRankedActions('root', { tree }).map(a => a.id);
      expect(ids).not.toContain('submit-final-results');
    });

    it('emits submit-final-results when every class in the trial is complete', () => {
      const tree = buildShowMapTree({
        show,
        trials: [trial],
        classes: [
          {
            id: 'class-a',
            trialId: 'trial-1',
            name: 'Container Novice A',
            status: 'Complete',
          },
          {
            id: 'class-b',
            trialId: 'trial-1',
            name: 'Interior Novice A',
            status: 'Complete',
          },
        ],
        entries: [
          { id: 'e-a', class_id: 'class-a', is_scored: true, judge_signature_timestamp: '2026-05-18' },
          { id: 'e-b', class_id: 'class-b', is_scored: true, judge_signature_timestamp: '2026-05-18' },
        ],
      });

      const ids = getRankedActions('root', { tree }).map(a => a.id);
      expect(ids).toContain('submit-final-results');
    });

    it('still rolls a complete-but-unsigned class up to trial NEEDS_WRAP_UP even when other classes are in progress', () => {
      // NEEDS_WRAP_UP stays loose: an unsigned signature is urgent regardless
      // of whether other classes are still scoring. The signal must surface
      // immediately so the secretary can chase the judge while the show runs.
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
          {
            id: 'class-still-running',
            trialId: 'trial-1',
            name: 'Interior Novice A',
            status: 'In Progress',
          },
        ],
        entries: [
          // Complete but unsigned → class-level NEEDS_JUDGE_SIGNATURE.
          { id: 'e1', class_id: 'class-needs-signature', is_scored: true },
        ],
      });

      const trialNode = tree.nodesById['trial:trial-1'];
      expect(trialNode?.wrapUpStatus?.value).toBe('needs-wrap-up');

      const ids = getRankedActions('root', { tree }).map(a => a.id);
      expect(ids).toContain('collect-judge-signature');
      // NEEDS_WRAP_UP does not itself emit a trial-level action; that's by design.
      expect(ids).not.toContain('submit-final-results');
    });
  });

  describe('getAttentionCountsByNodeId', () => {
    it('rolls per-node attention up to root in unified (phase=undefined) mode', () => {
      // 2 submitted entries on class-active (live-ops) + 1 unsigned-complete
      // class on class-needs-signature (wrap-up). Root should see 3 items.
      const tree = buildShowMapTree({
        show,
        trials: [trial],
        classes: [
          {
            id: 'class-active',
            trialId: 'trial-1',
            name: 'Interior Novice A',
            status: 'In Progress',
          },
          {
            id: 'class-needs-signature',
            trialId: 'trial-1',
            name: 'Container Novice A',
            status: 'Complete',
          },
        ],
        entries: [
          {
            id: 'entry-a',
            class_id: 'class-active',
            dog: { call_name: 'Bella' },
            entry_status: 'submitted',
          },
          {
            id: 'entry-b',
            class_id: 'class-active',
            dog: { call_name: 'Scout' },
            entry_status: 'submitted',
          },
          { id: 'entry-needs-signature', class_id: 'class-needs-signature', is_scored: true },
        ],
      });

      const counts = getAttentionCountsByNodeId(tree, undefined);

      expect(counts.get(tree.root.id)).toBe(3);
      expect(counts.get('trial:trial-1')).toBe(3);
      expect(counts.get('class:class-active')).toBe(2);
      expect(counts.get('class:class-needs-signature')).toBe(1);
      expect(counts.get('entry:entry-a')).toBe(1);
      expect(counts.get('entry:entry-b')).toBe(1);
    });

    // B6: phase-filter variants of getAttentionCountsByNodeId were removed
    // alongside the Today/Wrap-up tabs. The unified count is the only
    // contract — the rollup above already exercises it. The cross-show
    // dashboard's entry-only contract still lives on
    // tree.root.attentionCount (separate code path, untouched).

    it('returns an empty map when no node carries attention work', () => {
      const tree = buildShowMapTree({
        show,
        trials: [trial],
        classes: [
          {
            id: 'class-active',
            trialId: 'trial-1',
            name: 'Interior Novice A',
            status: 'In Progress',
          },
        ],
        entries: [
          { id: 'e1', class_id: 'class-active', check_in_status: 'checked-in' },
        ],
      });

      const counts = getAttentionCountsByNodeId(tree, undefined);

      expect(counts.size).toBe(0);
    });
  });

  describe('edit-score entry action (B2b)', () => {
    it('emits edit-score with the entry deep-link when the parent class is active', () => {
      const tree = buildShowMapTree({
        show,
        trials: [trial],
        classes: [
          { id: 'class-active', trialId: 'trial-1', name: 'Interior', status: 'In Progress' },
        ],
        entries: [
          { id: 'entry-1', class_id: 'class-active', dog: { call_name: 'Bella' } },
          { id: 'entry-2', class_id: 'class-active', dog: { call_name: 'Scout' } },
        ],
      });

      const editActions = getRankedActions('root', { tree }).filter(a => a.id === 'edit-score');
      expect(editActions).toHaveLength(2);
      expect(editActions[0]).toMatchObject({
        id: 'edit-score',
        href: '/scoring/classes/class-active/entries?entryId=entry-1&mode=split',
        classId: 'class-active',
      });
    });

    it('emits edit-score on a complete entry regardless of class status (post-hoc correction)', () => {
      const tree = buildShowMapTree({
        show,
        trials: [trial],
        classes: [
          { id: 'class-complete', trialId: 'trial-1', name: 'Buried', status: 'Complete' },
        ],
        entries: [{ id: 'entry-scored', class_id: 'class-complete', is_scored: true }],
      });

      const editAction = getRankedActions(tree.nodesById['entry:entry-scored']!, { tree }).find(
        a => a.id === 'edit-score'
      );
      expect(editAction).toBeDefined();
      expect(editAction).toMatchObject({
        href: '/scoring/classes/class-complete/entries?entryId=entry-scored&mode=split',
      });
    });

    it('does NOT emit edit-score on an unscored entry in a not-started class', () => {
      const tree = buildShowMapTree({
        show,
        trials: [trial],
        classes,
        entries: [
          {
            id: 'entry-pending',
            class_id: 'class-future',
            dog: { call_name: 'Scout' },
            entry_status: 'accepted',
          },
        ],
      });

      const ids = getRankedActions(tree.nodesById['entry:entry-pending']!, { tree }).map(a => a.id);
      expect(ids).not.toContain('edit-score');
    });

    // B6: the phase: 'wrap-up' filter no longer exists. edit-score is in
    // the unified action set whenever its predicate is satisfied —
    // surfacing it everywhere is correct because Show Desk is the only
    // operational surface now.
  });

  describe('class-row primary action lifecycle (B2b Pattern 3)', () => {
    it("returns 'mark-class-started' for a not-started class", () => {
      const tree = buildShowMapTree({
        show,
        trials: [trial],
        classes: [{ id: 'c', trialId: 'trial-1', name: 'Novice', status: 'Not Started' }],
        entries: [],
      });

      expect(getPrimaryActionForNode(tree.nodesById['class:c'], { tree })).toMatchObject({
        id: 'mark-class-started',
      });
    });

    it("returns 'score-class' for an active class", () => {
      const tree = buildShowMapTree({
        show,
        trials: [trial],
        classes: [{ id: 'c', trialId: 'trial-1', name: 'Novice', status: 'In Progress' }],
        entries: [],
      });

      expect(getPrimaryActionForNode(tree.nodesById['class:c'], { tree })).toMatchObject({
        id: 'score-class',
      });
    });

    it("returns 'open-class' for a complete + submitted-to-registry class (no wrap-up competing)", () => {
      // A complete class still in pre-submit limbo emits review-results
      // (priority 60) which beats open-class — that's correct behavior, the
      // next step really IS review. Pattern 3's "Open Class" applies once
      // the trial has been submitted to the registry, after which no
      // wrap-up action competes.
      const trialSubmitted = {
        ...trial,
        resultSubmittedAt: '2026-05-20T12:00:00Z',
      } as SyncableTrial;
      const tree = buildShowMapTree({
        show,
        trials: [trialSubmitted],
        classes: [{ id: 'c', trialId: 'trial-1', name: 'Novice', status: 'Complete' }],
        entries: [
          { id: 'e1', class_id: 'c', is_scored: true, judge_signature_timestamp: '2026-05-18' },
        ],
      });

      expect(getPrimaryActionForNode(tree.nodesById['class:c'], { tree })).toMatchObject({
        id: 'open-class',
      });
    });
  });
});
