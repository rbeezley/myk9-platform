import { describe, expect, it } from 'vitest';
import {
  buildShowMapTree,
  getDefaultExpandedNodeIds,
  getTrialsExpandedNodeIds,
} from '../showMapTree';
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
    id: 'class-1',
    trialId: 'trial-1',
    name: 'Interior Novice A',
    element: 'Interior',
    level: 'Novice',
    section: 'A',
    status: 'In Progress',
  },
];

describe('buildShowMapTree', () => {
  it('creates show to trial to class to entry hierarchy with counts', () => {
    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes,
      entries: [
        {
          id: 'entry-1',
          class_id: 'class-1',
          dog_id: 'dog-1',
          handler_id: 'person-1',
          armband: '12',
          entry_status: 'accepted',
          check_in_status: 'checked-in',
          handler: 'Jane Handler',
          dog: {
            call_name: 'Bella',
            breed: 'Mixed Breed',
            registrations: [
              { organization: 'UKC', breed: 'All American Dog' },
              { organization: 'AKC', breed: 'Labrador Retriever' },
            ],
          },
        },
      ],
    });

    expect(tree.root.label).toBe('Spring Trial');
    expect(tree.childIdsByParentId[tree.root.id]).toEqual(['trial:trial-1']);
    expect(tree.childIdsByParentId['trial:trial-1']).toEqual(['class:class-1']);
    expect(tree.childIdsByParentId['class:class-1']).toEqual(['entry:entry-1']);
    expect(tree.nodesById['class:class-1']?.scoreHref).toBe(
      '/scoring/classes/class-1/entries?mode=split'
    );
    expect(tree.nodesById['entry:entry-1']?.label).toBe('#12 Bella');
    expect(tree.nodesById['entry:entry-1']?.entryDisplay).toEqual({
      armband: '12',
      dogName: 'Bella',
      breed: 'Labrador Retriever',
      handler: 'Jane Handler',
      handlerId: 'person-1',
      dogHref: '/dogs/dog-1',
      handlerHref: '/people/person-1',
    });
    expect(tree.nodesById['entry:entry-1']?.scoreHref).toBeUndefined();
  });

  it('keeps empty shows as a root-only tree', () => {
    const tree = buildShowMapTree({ show, trials: [], classes: [], entries: [] });

    expect(tree.root.childrenCount).toBe(0);
    expect(tree.childIdsByParentId[tree.root.id]).toEqual([]);
  });

  it('defaults expansion to the root so trial rows render but class rows stay hidden', () => {
    const tree = buildShowMapTree({ show, trials: [trial], classes, entries: [] });
    expect(getDefaultExpandedNodeIds(tree)).toEqual(new Set([tree.root.id]));
  });

  it('exposes a "trials expanded" helper for the toolbar action', () => {
    const tree = buildShowMapTree({ show, trials: [trial], classes, entries: [] });
    expect(getTrialsExpandedNodeIds(tree)).toEqual(new Set([tree.root.id, 'trial:trial-1']));
  });

  it('adds a deterministic marker when entries are capped', () => {
    const entries = Array.from({ length: 3 }, (_, index) => ({
      id: `entry-${index}`,
      class_id: 'class-1',
      run_order: index,
      dog: { call_name: `Dog ${index}` },
    }));

    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes,
      entries,
      entryPreviewLimit: 2,
    });

    expect(tree.childIdsByParentId['class:class-1']).toEqual([
      'entry:entry-0',
      'entry:entry-1',
      'more:class-1',
    ]);
    expect(tree.nodesById['more:class-1']?.label).toBe('1 more entries');
  });

  it('adds wrap-up statuses to completed class and trial nodes', () => {
    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes: [
        {
          ...classes[0]!,
          status: 'Complete',
          judgeSigned: false,
        },
      ],
      entries: [],
    });

    expect(tree.nodesById['class:class-1']?.wrapUpStatus).toMatchObject({
      value: 'needs-judge-signature',
      label: 'Needs judge signature',
      kind: 'attention',
    });
    expect(tree.nodesById['trial:trial-1']?.wrapUpStatus).toMatchObject({
      value: 'needs-wrap-up',
      label: 'Needs wrap-up',
      kind: 'attention',
    });
  });
});
