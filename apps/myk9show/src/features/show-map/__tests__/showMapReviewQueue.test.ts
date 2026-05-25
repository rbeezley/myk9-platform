import { describe, expect, it } from 'vitest';
import { buildShowMapTree } from '../showMapTree';
import { buildReviewQueue, reviewQueueTotalCount } from '../showMapReviewQueue';
import type { ShowMapClassInput } from '../showMapTypes';
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
];

describe('buildReviewQueue', () => {
  it('returns an empty queue when no entries are submitted', () => {
    const tree = buildShowMapTree({ show, trials: [trial], classes, entries: [] });
    expect(buildReviewQueue(tree)).toEqual([]);
  });

  it('groups submitted entries by dogId', () => {
    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes,
      entries: [
        {
          id: 'e-bravo-a',
          class_id: 'class-a',
          dog: { id: 'dog-bravo', call_name: 'Bravo' },
          handler_name: 'Test Secretary',
          entry_status: 'submitted',
        },
        {
          id: 'e-bravo-b',
          class_id: 'class-b',
          dog: { id: 'dog-bravo', call_name: 'Bravo' },
          handler_name: 'Test Secretary',
          entry_status: 'submitted',
        },
        {
          id: 'e-ace',
          class_id: 'class-a',
          dog: { id: 'dog-ace', call_name: 'Ace' },
          handler_name: 'Alice Martin',
          entry_status: 'submitted',
        },
      ],
    });

    const queue = buildReviewQueue(tree);
    expect(queue).toHaveLength(2);

    const bravo = queue.find(g => g.dogId === 'dog-bravo');
    const ace = queue.find(g => g.dogId === 'dog-ace');
    expect(bravo).toBeDefined();
    expect(ace).toBeDefined();
    expect(bravo!.count).toBe(2);
    expect(bravo!.entryIds.sort()).toEqual(['e-bravo-a', 'e-bravo-b']);
    expect(bravo!.handler).toBe('Test Secretary');
    expect(ace!.count).toBe(1);
    expect(ace!.entryIds).toEqual(['e-ace']);
    expect(reviewQueueTotalCount(queue)).toBe(3);
  });

  it('excludes entries that are not in submitted status', () => {
    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes,
      entries: [
        {
          id: 'e-confirmed',
          class_id: 'class-a',
          dog: { id: 'dog-1', call_name: 'Lucky' },
          entry_status: 'confirmed',
        },
        {
          id: 'e-draft',
          class_id: 'class-a',
          dog: { id: 'dog-2', call_name: 'Sasha' },
          entry_status: 'draft',
        },
        {
          id: 'e-submitted',
          class_id: 'class-a',
          dog: { id: 'dog-3', call_name: 'Rex' },
          entry_status: 'submitted',
        },
      ],
    });

    const queue = buildReviewQueue(tree);
    expect(queue).toHaveLength(1);
    expect(queue[0].dogName).toBe('Rex');
  });

  it('treats entries with no dogId as their own size-1 groups', () => {
    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes,
      entries: [
        {
          id: 'e-anon-1',
          class_id: 'class-a',
          dog: { call_name: 'Anon One' },
          entry_status: 'submitted',
        },
        {
          id: 'e-anon-2',
          class_id: 'class-a',
          dog: { call_name: 'Anon Two' },
          entry_status: 'submitted',
        },
      ],
    });

    const queue = buildReviewQueue(tree);
    expect(queue).toHaveLength(2);
    expect(queue.every(g => g.count === 1)).toBe(true);
    expect(queue.every(g => g.dogId === undefined)).toBe(true);
  });

  it('reviewQueueTotalCount sums across groups', () => {
    expect(reviewQueueTotalCount([])).toBe(0);
    expect(
      reviewQueueTotalCount([
        {
          key: 'a',
          dogName: 'A',
          entryIds: ['1', '2'],
          entryNodeIds: ['n1', 'n2'],
          count: 2,
        },
        {
          key: 'b',
          dogName: 'B',
          entryIds: ['3'],
          entryNodeIds: ['n3'],
          count: 1,
        },
      ])
    ).toBe(3);
  });
});
