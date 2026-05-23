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
    // Each test entry sets check_in_status: 'checked-in' so this assertion isolates
    // the review signal — missing/null check_in_status now legitimately counts as
    // waiting-for-check-in (see the null/undefined test below).
    const signals = computeShowDeskPendingSignals({
      tree: t,
      entries: [
        { entry_status: 'submitted', check_in_status: 'checked-in' },
        { entry_status: 'submitted', check_in_status: 'checked-in' },
        { entry_status: 'accepted', check_in_status: 'checked-in' },
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

  it('counts null and undefined check_in_status as waiting (matches real DB rows)', () => {
    // Regression: prior version only matched literal 'no-status', so brand-new DB
    // rows (where the gate steward hasn't touched the entry yet and the column is
    // null) were invisible to the chip. Normalize null/undefined/empty.
    const t = tree([
      {
        id: 'e1',
        class_id: 'class-active',
        dog: { call_name: 'Bella' },
      },
    ]);
    const signals = computeShowDeskPendingSignals({
      tree: t,
      entries: [
        { check_in_status: null },
        { check_in_status: undefined },
        {}, // missing field entirely
        { check_in_status: 'no-status' },
        { check_in_status: 'checked-in' }, // does NOT count
      ],
    });
    const waiting = signals.find(s => s.id === 'entries-waiting-checkin');
    expect(waiting).toBeDefined();
    expect(waiting?.count).toBe(4);
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
