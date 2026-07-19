import { describe, expect, it } from 'vitest';
import { buildShowMapTree } from '../showMapTree';
import { computeShowDeskPendingSignals } from '../showDeskPendingSignals';
import type { Show } from '@/types/show-types';
import type { SyncableTrial } from '@/store/trial-store-types';
import type { ShowMapClassInput } from '../showMapTypes';
import {
  classifyRawEntryAttention,
  matchesOperationalAttentionFilter,
} from '@/features/entry-operations/attentionClassification';
import { normalizeEntryManagementSearchParams } from '@/components/entries/management/entryManagementFilters';

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

function tree(
  entries: Array<Record<string, unknown>>,
  classes: ShowMapClassInput[] = [activeClass]
) {
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
        showId: 'show-1',
        tree: t,
        entries: [{ entry_status: 'accepted', check_in_status: 'checked-in' }],
      })
    ).toEqual([]);
  });

  it('emits a highest-priority signal for Entry Management pending-bucket entries', () => {
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
      showId: 'show-1',
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
    expect(signals[0]?.label).toContain('Review 2 entries');
  });

  it('emits a high-priority signal when entries are waiting for check-in', () => {
    const t = tree([
      {
        id: 'e1',
        class_id: 'class-active',
        dog: { call_name: 'Bella' },
        entry_status: 'accepted',
        check_in_status: 'no-status',
      },
    ]);
    const signals = computeShowDeskPendingSignals({
      showId: 'show-1',
      tree: t,
      entries: [{ entry_status: 'accepted', check_in_status: 'no-status' }],
    });
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      id: 'entries-waiting-checkin',
      count: 1,
      priority: 'high',
    });
    expect(signals[0]?.label).toContain('Check in 1 entry');
  });

  it('counts null and undefined check_in_status as waiting for accepted entries (real DB rows)', () => {
    // Regression: prior version only matched literal 'no-status', so brand-new DB
    // rows (where the gate steward hasn't touched the entry yet and the column is
    // null) were invisible to the chip. Normalize null/undefined/empty — but only
    // count entries that are already accepted into the run order.
    const t = tree([
      {
        id: 'e1',
        class_id: 'class-active',
        dog: { call_name: 'Bella' },
        entry_status: 'accepted',
      },
    ]);
    const signals = computeShowDeskPendingSignals({
      showId: 'show-1',
      tree: t,
      entries: [
        { entry_status: 'accepted', check_in_status: null },
        { entry_status: 'accepted', check_in_status: undefined },
        { entry_status: 'accepted' }, // missing check-in field entirely
        { entry_status: 'confirmed', check_in_status: 'no-status' },
        { entry_status: 'accepted', check_in_status: 'checked-in' }, // does NOT count
      ],
    });
    const waiting = signals.find(s => s.id === 'entries-waiting-checkin');
    expect(waiting).toBeDefined();
    expect(waiting?.count).toBe(4);
  });

  it('does NOT count pre-acceptance entries (submitted/draft/pending) as waiting for check-in', () => {
    // Regression: submitted entries are already surfaced in waiting-for-review and
    // are not in the run order yet — they should not double-fire in the check-in
    // chip just because check_in_status is null.
    const t = tree([
      {
        id: 'e1',
        class_id: 'class-active',
        dog: { call_name: 'Bella' },
        entry_status: 'submitted',
      },
    ]);
    const signals = computeShowDeskPendingSignals({
      showId: 'show-1',
      tree: t,
      entries: [
        { entry_status: 'submitted', check_in_status: null },
        { entry_status: 'submitted' },
        { entry_status: 'draft', check_in_status: 'no-status' },
        { entry_status: 'pending', check_in_status: null },
      ],
    });
    const waiting = signals.find(s => s.id === 'entries-waiting-checkin');
    expect(waiting).toBeUndefined();
    // Pre-acceptance entries still surface in the pending-bucket chip.
    const review = signals.find(s => s.id === 'entries-waiting-review');
    expect(review?.count).toBe(4);
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
    const signals = computeShowDeskPendingSignals({ showId: 'show-1', tree: t, entries: [] });
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
    const signals = computeShowDeskPendingSignals({ showId: 'show-1', tree: t, entries: [] });
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
      showId: 'show-1',
      tree: t,
      entries: [
        { entry_status: 'submitted' },
        { entry_status: 'accepted', check_in_status: 'no-status' },
      ],
    });
    expect(signals.map(s => s.priority)).toEqual(['highest', 'high', 'high']);
  });

  describe('route/count agreement', () => {
    it('waiting-review count matches the pending destination filter, hrefs round-trip, and non-actionable signals stay null', () => {
      const rawEntries = [
        { entry_status: 'submitted', check_in_status: 'checked-in' },
        { entry_status: 'pending', check_in_status: 'checked-in' },
        { entry_status: 'missing_info', check_in_status: 'checked-in' },
        { entry_status: 'accepted', check_in_status: 'checked-in', payment_status: 'paid' },
      ];
      const t = tree(
        rawEntries.map((e, i) => ({
          id: `e${i}`,
          class_id: 'class-active',
          dog: { call_name: `Dog${i}` },
          ...e,
        }))
      );
      const signals = computeShowDeskPendingSignals({
        showId: 'show-1',
        tree: t,
        entries: rawEntries,
      });

      const review = signals.find(s => s.id === 'entries-waiting-review');
      expect(review).toBeDefined();
      const destinationCount = rawEntries.filter(entry =>
        matchesOperationalAttentionFilter({ rawEntryStatus: entry.entry_status }, 'pending')
      ).length;
      expect(review?.count).toBe(destinationCount);
      expect(review?.href).toBeTruthy();

      const params = new URLSearchParams(review!.href!.split('?')[1]);
      const normalized = normalizeEntryManagementSearchParams(params);
      expect(normalized.attention).toBe('pending');
      expect(normalized.mode).toBe('review');
    });

    it('payment-due count matches accepted entries with pending effective payment status, and href round-trips', () => {
      const rawEntries = [
        { entry_status: 'accepted', check_in_status: 'checked-in', payment_status: 'pending' },
        { entry_status: 'accepted', check_in_status: 'checked-in', payment_status: 'paid_online' },
        { entry_status: 'submitted', check_in_status: 'checked-in', payment_status: 'pending' },
        {
          entry_status: 'accepted',
          check_in_status: 'checked-in',
          payment_status: 'paid_online',
          registration: { payment_status: 'pending' },
        },
      ];
      const t = tree(
        rawEntries.map((e, i) => ({
          id: `e${i}`,
          class_id: 'class-active',
          dog: { call_name: `Dog${i}` },
          ...e,
        }))
      );
      const signals = computeShowDeskPendingSignals({
        showId: 'show-1',
        tree: t,
        entries: rawEntries,
      });

      const paymentDue = signals.find(s => s.id === 'entries-payment-due');
      expect(paymentDue).toBeDefined();
      // Same predicate the Entry Management payment filter uses.
      const destinationCount = rawEntries.filter(entry =>
        classifyRawEntryAttention(entry).includes('payment_due')
      ).length;
      expect(destinationCount).toBe(2);
      expect(paymentDue?.count).toBe(destinationCount);
      expect(paymentDue?.priority).toBe('high');
      expect(paymentDue?.href).toBeTruthy();

      const params = new URLSearchParams(paymentDue!.href!.split('?')[1]);
      const normalized = normalizeEntryManagementSearchParams(params);
      expect(normalized.attention).toBe('accepted');
      expect(normalized.payment).toBe('pending');
      expect(normalized.mode).toBe('review');
    });

    it('check-in count matches accepted/confirmed entries not yet checked in, and href round-trips to day-of mode', () => {
      const rawEntries = [
        { entry_status: 'accepted', check_in_status: null },
        { entry_status: 'confirmed' },
        { entry_status: 'accepted', check_in_status: 'checked-in' },
        // multi-class enrollment: two rows for the same underlying entry both count.
        { entry_status: 'accepted', check_in_status: 'no-status' },
      ];
      const t = tree(
        rawEntries.map((e, i) => ({
          id: `e${i}`,
          class_id: 'class-active',
          dog: { call_name: `Dog${i}` },
          ...e,
        }))
      );
      const signals = computeShowDeskPendingSignals({
        showId: 'show-1',
        tree: t,
        entries: rawEntries,
      });

      const checkIn = signals.find(s => s.id === 'entries-waiting-checkin');
      expect(checkIn).toBeDefined();
      expect(checkIn?.count).toBe(3);
      expect(checkIn?.href).toBeTruthy();

      const params = new URLSearchParams(checkIn!.href!.split('?')[1]);
      const normalized = normalizeEntryManagementSearchParams(params);
      expect(normalized.attention).toBe('accepted');
      expect(normalized.mode).toBe('day-of');
    });

    it('excludes terminal/pulled entries from waiting-review and payment-due counts', () => {
      const rawEntries = [
        { entry_status: 'scratched', check_in_status: 'checked-in', payment_status: 'pending' },
        { entry_status: 'cancelled', check_in_status: 'checked-in', payment_status: 'pending' },
        { entry_status: 'completed', check_in_status: 'checked-in', payment_status: 'pending' },
      ];
      const t = tree(
        rawEntries.map((e, i) => ({
          id: `e${i}`,
          class_id: 'class-active',
          dog: { call_name: `Dog${i}` },
          ...e,
        }))
      );
      const signals = computeShowDeskPendingSignals({
        showId: 'show-1',
        tree: t,
        entries: rawEntries,
      });

      expect(signals.find(s => s.id === 'entries-waiting-review')).toBeUndefined();
      expect(signals.find(s => s.id === 'entries-payment-due')).toBeUndefined();
    });

    it('classes-needing-signature and results-pending-closeout are non-actionable (href null) since no verified matching-unit destination exists', () => {
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
      const signals = computeShowDeskPendingSignals({ showId: 'show-1', tree: t, entries: [] });
      const closeout = signals.find(s => s.id === 'results-pending-closeout');
      expect(closeout).toBeDefined();
      expect(closeout?.href).toBeNull();
    });

    it('yields no fabricated signals or counts for an empty/partial entries array (pure-function loading behavior)', () => {
      const t = tree([], []);
      const signals = computeShowDeskPendingSignals({ showId: 'show-1', tree: t, entries: [] });
      expect(signals).toEqual([]);
    });

    it('every actionable signal carries a show scope matching the input showId', () => {
      const t = tree([
        {
          id: 'e1',
          class_id: 'class-active',
          dog: { call_name: 'Bella' },
          entry_status: 'submitted',
        },
      ]);
      const signals = computeShowDeskPendingSignals({
        showId: 'show-42',
        tree: t,
        entries: [{ entry_status: 'submitted', check_in_status: 'checked-in' }],
      });
      expect(signals.length).toBeGreaterThan(0);
      for (const signal of signals) {
        expect(signal.scope).toEqual({ kind: 'show', showId: 'show-42' });
      }
      expect(signals[0]?.href).toContain('/shows/show-42/entry-management');
    });
  });
});
