import { describe, expect, it } from 'vitest';
import { buildShowMapTree } from '../showMapTree';
import {
  getAttentionActions,
  getPrimaryActionForNode,
  getRankedActions,
  showMapBadgeTargets,
} from '../showMapActions';
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
});
