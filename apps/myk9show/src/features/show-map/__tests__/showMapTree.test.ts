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

function dogEntry(
  id: string,
  dogId: string | undefined,
  armband: string,
  dogName = 'Bella',
  breed = 'Labrador Retriever',
  handler?: string | undefined,
  classId = 'class-1'
): Record<string, unknown> {
  return {
    id,
    class_id: classId,
    ...(dogId ? { dog_id: dogId } : {}),
    armband,
    ...(handler ? { handler } : {}),
    dog: { ...(dogId ? { id: dogId } : {}), call_name: dogName, breed },
  };
}

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
    expect(tree.nodesById['trial:trial-1']?.parentId).toBe(tree.root.id);
    expect(tree.childIdsByParentId['trial:trial-1']).toEqual(['class:class-1']);
    expect(tree.childIdsByParentId['class:class-1']).toEqual(['entry:entry-1']);
    expect(tree.nodesById['class:class-1']?.scoreHref).toBe(
      '/scoring/classes/class-1/entries?mode=split'
    );
    expect(tree.nodesById['entry:entry-1']?.label).toBe('#12 Bella');
    expect(tree.nodesById['entry:entry-1']?.entryDisplay).toEqual({
      armband: '12',
      dogName: 'Bella',
      dogId: 'dog-1',
      breed: 'Labrador Retriever',
      handler: 'Jane Handler',
      handlerId: 'person-1',
      dogHref: '/dogs/dog-1',
      handlerHref: '/people/person-1',
    });
    expect(tree.nodesById['entry:entry-1']?.scoreHref).toBeUndefined();
  });

  it('adds an All Exhibitors branch before trial rows', () => {
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
          handler: 'Jane Handler',
          dog: { id: 'dog-1', call_name: 'Bella', breed: 'Labrador Retriever' },
        },
      ],
    });

    expect(tree.childIdsByParentId[tree.root.id]).toEqual([
      'all-exhibitors:show-1',
      'trial:trial-1',
    ]);
    expect(tree.nodesById['all-exhibitors:show-1']).toMatchObject({
      id: 'all-exhibitors:show-1',
      type: 'all-exhibitors',
      label: 'All Exhibitors',
      count: 1,
      childrenCount: 1,
      isSynthetic: true,
    });
    expect(tree.childIdsByParentId['all-exhibitors:show-1']).toEqual(['dog:dog-1']);
  });

  it('groups dog entries and sorts dog rows by armband, dog name, handler, then stable key', () => {
    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes,
      entries: [
        dogEntry('entry-ranger', 'dog-ranger', '22', 'Ranger', 'Beagle', 'Pat Handler'),
        dogEntry('entry-bella', 'dog-bella', '14', 'Bella', undefined, 'Jane Handler'),
        dogEntry('entry-ace', 'dog-ace', '14', 'Ace', 'Mixed Breed', 'Sam Handler'),
        dogEntry('entry-echo-zoe', 'dog-echo-zoe', '16', 'Echo', 'Beagle', 'Zoe Handler'),
        dogEntry('entry-echo-amy', 'dog-echo-amy', '16', 'Echo', 'Beagle', 'Amy Handler'),
        dogEntry('entry-scout-b', 'dog-scout-b', '18', 'Scout', 'Poodle', 'Lee Handler'),
        dogEntry('entry-scout-a', 'dog-scout-a', '18', 'Scout', 'Poodle', 'Lee Handler'),
      ],
    });

    expect(tree.childIdsByParentId['all-exhibitors:show-1']).toEqual([
      'dog:dog-ace',
      'dog:dog-bella',
      'dog:dog-echo-amy',
      'dog:dog-echo-zoe',
      'dog:dog-scout-a',
      'dog:dog-scout-b',
      'dog:dog-ranger',
    ]);
    expect(tree.nodesById['dog:dog-ace']).toMatchObject({
      type: 'dog',
      label: '#14 Ace',
      subtitle: 'Sam Handler · Mixed Breed',
      count: 1,
      childrenCount: 1,
    });
  });

  it('shows dog-entry children with class and trial context', () => {
    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes: [
        {
          ...classes[0]!,
          ring: 2,
          judgeName: 'Judge Judy',
          time: '09:30',
          trialName: 'Morning Trial',
        },
      ],
      entries: [
        {
          id: 'entry-1',
          class_id: 'class-1',
          dog_id: 'dog-1',
          armband: '12',
          handler: 'Jane Handler',
          dog: { id: 'dog-1', call_name: 'Bella', breed: 'Labrador Retriever' },
        },
      ],
    });

    expect(tree.childIdsByParentId['dog:dog-1']).toEqual(['dog-entry:entry-1']);
    expect(tree.nodesById['dog-entry:entry-1']).toMatchObject({
      type: 'dog-entry',
      label: 'Interior Novice A',
      subtitle: 'Spring Trial · 2026-05-11 · Ring 2 · Judge Judy · 09:30',
      dogEntryDisplay: {
        entryId: 'entry-1',
        classId: 'class-1',
        classLabel: 'Interior Novice A',
        trialId: 'trial-1',
        trialLabel: 'Spring Trial',
        trialDate: '2026-05-11',
        ringLabel: 'Ring 2',
        judgeName: 'Judge Judy',
        startTime: '09:30',
      },
    });
  });

  it('uses class trial name for dog-entry context when trial lookup is missing', () => {
    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes: [
        {
          ...classes[0]!,
          trialId: 'missing-trial',
          trialName: 'Fallback Trial',
          trialDate: '2026-05-12',
          ring: 1,
        },
      ],
      entries: [dogEntry('entry-orphan-trial', 'dog-1', '12')],
    });

    expect(tree.nodesById['dog-entry:entry-orphan-trial']).toMatchObject({
      type: 'dog-entry',
      label: 'Interior Novice A',
      subtitle: 'Fallback Trial · 2026-05-12 · Ring 1',
      dogEntryDisplay: {
        entryId: 'entry-orphan-trial',
        classId: 'class-1',
        classLabel: 'Interior Novice A',
        trialLabel: 'Fallback Trial',
        trialDate: '2026-05-12',
        ringLabel: 'Ring 1',
      },
    });
  });

  it('groups multiple entries for the same dog under one dog row', () => {
    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes: [
        classes[0]!,
        {
          ...classes[0]!,
          id: 'class-2',
          name: 'Exterior Novice A',
        },
      ],
      entries: [
        dogEntry('entry-interior', 'dog-1', '12', 'Bella', undefined, 'Jane Handler'),
        dogEntry('entry-exterior', 'dog-1', '12', 'Bella', undefined, 'Jane Handler', 'class-2'),
      ],
    });

    expect(tree.childIdsByParentId['all-exhibitors:show-1']).toEqual(['dog:dog-1']);
    expect(tree.nodesById['dog:dog-1']).toMatchObject({
      type: 'dog',
      label: '#12 Bella',
      count: 2,
      childrenCount: 2,
    });
    expect(tree.childIdsByParentId['dog:dog-1']).toEqual([
      'dog-entry:entry-exterior',
      'dog-entry:entry-interior',
    ]);
  });

  it('keeps no-id entries with the same call name as separate fallback dog rows', () => {
    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes,
      entries: [
        dogEntry('entry-bella-a', undefined, '31', 'Bella', undefined, 'Jane Handler'),
        dogEntry('entry-bella-b', undefined, '32', 'Bella', 'Beagle', 'Sam Handler'),
      ],
    });

    expect(tree.childIdsByParentId['all-exhibitors:show-1']).toEqual([
      'dog:unknown-entry:entry-bella-a',
      'dog:unknown-entry:entry-bella-b',
    ]);
    expect(tree.nodesById['dog:unknown-entry:entry-bella-a']).toMatchObject({
      label: '#31 Bella',
      count: 1,
      childrenCount: 1,
    });
    expect(tree.nodesById['dog:unknown-entry:entry-bella-b']).toMatchObject({
      label: '#32 Bella',
      count: 1,
      childrenCount: 1,
    });
  });

  it('uses stable fallback dog rows when an entry has no dog id or name', () => {
    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes,
      entries: [
        {
          id: 'entry-unknown',
          class_id: 'class-1',
          armband: '99',
        },
      ],
    });

    expect(tree.childIdsByParentId['all-exhibitors:show-1']).toEqual([
      'dog:unknown-entry:entry-unknown',
    ]);
    expect(tree.nodesById['dog:unknown-entry:entry-unknown']).toMatchObject({
      type: 'dog',
      label: '#99 Unknown dog',
      count: 1,
      childrenCount: 1,
    });
  });

  it('keeps dog-entry rows visible when class or trial context is missing', () => {
    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes,
      entries: [
        {
          id: 'entry-missing-class',
          class_id: 'missing-class',
          dog_id: 'dog-1',
          dog: { id: 'dog-1', call_name: 'Bella' },
        },
      ],
    });

    expect(tree.childIdsByParentId['dog:dog-1']).toEqual(['dog-entry:entry-missing-class']);
    expect(tree.nodesById['dog-entry:entry-missing-class']).toMatchObject({
      type: 'dog-entry',
      label: 'Unknown class',
      subtitle: undefined,
      dogEntryDisplay: {
        entryId: 'entry-missing-class',
        classLabel: 'Unknown class',
      },
    });
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

  it('does not expand the All Exhibitors branch from the "trials expanded" helper', () => {
    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes,
      entries: [
        {
          id: 'entry-1',
          class_id: 'class-1',
          dog_id: 'dog-1',
          dog: { id: 'dog-1', call_name: 'Bella' },
        },
      ],
    });

    expect(tree.childIdsByParentId[tree.root.id]).toEqual([
      'all-exhibitors:show-1',
      'trial:trial-1',
    ]);
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
        },
      ],
      entries: [
        {
          id: 'entry-needs-signature',
          class_id: 'class-1',
          is_scored: true,
        },
      ],
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

  it('rolls up submitted trials from result submission state', () => {
    const tree = buildShowMapTree({
      show,
      trials: [{ ...trial, resultSubmittedAt: '2026-05-18T12:00:00Z' }],
      classes: [
        {
          ...classes[0]!,
          status: 'Complete',
        },
      ],
      entries: [
        {
          id: 'entry-signed',
          class_id: 'class-1',
          is_scored: true,
          judge_signature_timestamp: '2026-05-18T11:00:00Z',
        },
      ],
    });

    expect(tree.nodesById['class:class-1']?.wrapUpStatus).toMatchObject({
      value: 'submitted-to-registry',
      label: 'Submitted to registry',
      kind: 'complete',
    });
    expect(tree.nodesById['trial:trial-1']?.wrapUpStatus).toMatchObject({
      value: 'submitted-to-registry',
      label: 'Submitted to registry',
      kind: 'complete',
    });
  });
});
