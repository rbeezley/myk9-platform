import { describe, expect, it } from 'vitest';
import { buildShowMapTree } from '../showMapTree';
import { computeShowDeskPendingSignals } from '../showDeskPendingSignals';
import type { Show } from '@/types/show-types';
import type { SyncableTrial } from '@/store/trial-store-types';
import type { ShowMapClassInput } from '../showMapTypes';

const show = {
  id: 'show-1',
  name: 'Spring Trial',
  clubName: 'Calm Canine Club',
  organization: 'AKC',
  startDate: '2026-05-15',
  endDate: '2026-05-17',
} as Show;

const trial = {
  id: 'trial-1',
  showId: 'show-1',
  showName: 'Spring Trial',
  trialDate: '2026-05-15',
  trialNumber: '1',
  status: 'In Progress',
  _version: 1,
  _lastModified: new Date(),
  _lastModifiedBy: 'test',
  _syncStatus: 'synced',
} as SyncableTrial;

const activeClass: ShowMapClassInput = {
  id: 'class-active',
  trialId: 'trial-1',
  name: 'Interior Novice A',
  status: 'In Progress',
};

const completedClass: ShowMapClassInput = {
  id: 'class-complete',
  trialId: 'trial-1',
  name: 'Exterior Novice A',
  status: 'Completed',
};

function tree(entries: Array<Record<string, unknown>>, classes: ShowMapClassInput[] = [activeClass]) {
  return buildShowMapTree({ show, trials: [trial], classes, entries });
}

describe('computeShowDeskPendingSignals', () => {
  it('returns no signals for a clean tree', () => {
    const t = tree([
      {
        id: 'e1',
        class_id: 'class-active',
        dog: { call_name: 'Bella' },
        entry_status: 'accepted',
        check_in_status: 'checked-in',
      },
    ]);
    expect(
      computeShowDeskPendingSignals({
        tree: t,
        entries: [{ entry_status: 'accepted', check_in_status: 'checked-in' }],
      })
    ).toEqual([]);
  });

  it('emits a highest-priority signal when entries are waiting for review', () => {
    const t = tree([
      {
        id: 'e1',
        class_id: 'class-active',
        dog: { call_name: 'Bella' },
        entry_status: 'submitted',
      },
      {
        id: 'e2',
        class_id: 'class-active',
        dog: { call_name: 'Coco' },
        entry_status: 'submitted',
      },
    ]);
    const signals = computeShowDeskPendingSignals({
      tree: t,
      entries: [
        { entry_status: 'submitted' },
        { entry_status: 'submitted' },
        { entry_status: 'accepted' },
      ],
    });
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      id: 'entries-waiting-review',
      count: 2,
      priority: 'highest',
    });
    expect(signals[0]?.label).toContain('2 entries waiting for review');
  });

  it('emits a high-priority signal when entries are waiting for check-in', () => {
    const t = tree([
      {
        id: 'e1',
        class_id: 'class-active',
        dog: { call_name: 'Bella' },
        check_in_status: 'no-status',
      },
    ]);
    const signals = computeShowDeskPendingSignals({
      tree: t,
      entries: [{ check_in_status: 'no-status' }],
    });
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      id: 'entries-waiting-checkin',
      count: 1,
      priority: 'high',
    });
    expect(signals[0]?.label).toContain('1 entry waiting for check-in');
  });

  it('emits a signal when a class needs judge signature', () => {
    const t = tree(
      [
        {
          id: 'e1',
          class_id: 'class-complete',
          dog: { call_name: 'Bella' },
          entry_status: 'accepted',
          is_scored: true,
        },
      ],
      [completedClass]
    );
    const signals = computeShowDeskPendingSignals({ tree: t, entries: [] });
    expect(signals.some(s => s.id === 'classes-needing-signature')).toBe(true);
  });

  it('emits results-pending-closeout when a class is signed but not submitted', () => {
    const t = tree(
      [
        {
          id: 'e1',
          class_id: 'class-complete',
          dog: { call_name: 'Bella' },
          entry_status: 'accepted',
          is_scored: true,
          judge_signature_timestamp: '2026-05-17T14:00:00Z',
        },
      ],
      [completedClass]
    );
    const signals = computeShowDeskPendingSignals({ tree: t, entries: [] });
    expect(signals.some(s => s.id === 'results-pending-closeout')).toBe(true);
  });

  it('orders signals by priority (highest → high → medium)', () => {
    const t = tree(
      [
        {
          id: 'e1',
          class_id: 'class-complete',
          dog: { call_name: 'Bella' },
          entry_status: 'accepted',
          is_scored: true,
        },
      ],
      [completedClass]
    );
    const signals = computeShowDeskPendingSignals({
      tree: t,
      entries: [{ entry_status: 'submitted' }, { check_in_status: 'no-status' }],
    });
    expect(signals.map(s => s.priority)).toEqual(['highest', 'high', 'high']);
  });
});
