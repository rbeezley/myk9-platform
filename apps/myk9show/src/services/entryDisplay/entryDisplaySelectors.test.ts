import { describe, expect, it } from 'vitest';
import {
  composeClassTitle,
  getEntryDisplay,
  getEntryStatusKind,
  getRefundLabel,
  getRemovedStatusLabel,
  isRemovedStatus,
  resolveClassSection,
  type EntryStatusKind,
} from './entryDisplaySelectors';

describe('getEntryStatusKind — the single classifier', () => {
  const cases: Array<[string, EntryStatusKind]> = [
    ['confirmed', 'accepted'],
    ['accepted', 'accepted'],
    ['paid', 'accepted'],
    ['scheduled', 'accepted'], // run order assigned, NOT in-ring
    ['submitted', 'pending'],
    ['pending', 'pending'],
    ['no-status', 'pending'],
    ['waitlisted', 'waitlist'],
    ['in-ring', 'in_ring'],
    ['competing', 'in_ring'],
    ['checked-in', 'in_ring'],
    ['completed', 'completed'],
    ['withdrawn', 'withdrawn'],
    ['cancelled', 'withdrawn'], // legacy alias
    ['not_accepted', 'not_accepted'],
    ['rejected', 'not_accepted'], // legacy (migration 173)
    ['promotion-expired', 'not_accepted'],
    ['scratched', 'scratched'],
    ['absent', 'absent'],
    ['moved', 'moved'],
    ['move-up-requested', 'move_up_requested'],
  ];

  it.each(cases)('maps %s -> %s', (raw, kind) => {
    expect(getEntryStatusKind(raw)).toBe(kind);
  });

  it('returns unknown (never a terminal/pending fallthrough) for garbage / null / undefined', () => {
    expect(getEntryStatusKind('totally-made-up')).toBe('unknown');
    expect(getEntryStatusKind(null)).toBe('unknown');
    expect(getEntryStatusKind(undefined)).toBe('unknown');
  });
});

describe('isRemovedStatus — terminal classification (the divergence fix)', () => {
  it('treats withdrawn / scratched / not_accepted as removed', () => {
    expect(isRemovedStatus('withdrawn')).toBe(true);
    expect(isRemovedStatus('scratched')).toBe(true);
    expect(isRemovedStatus('not_accepted')).toBe(true);
  });

  it('does NOT treat moved / absent / live states as removed', () => {
    for (const kind of ['moved', 'absent', 'pending', 'accepted', 'completed', 'in_ring'] as const) {
      expect(isRemovedStatus(kind)).toBe(false);
    }
  });

  // The bug this whole change exists to kill: a 'cancelled' (legacy) entry used to
  // miss the tab's 3-literal allowlist and fall through to "Upcoming" while the
  // page showed "Withdrawn". Now both classify it identically as removed.
  it('classifies the legacy cancelled value as removed (was the page-vs-tab divergence)', () => {
    expect(isRemovedStatus(getEntryStatusKind('cancelled'))).toBe(true);
    expect(isRemovedStatus(getEntryStatusKind('withdrawn'))).toBe(true);
  });

  it('getRemovedStatusLabel matches the prior allowlist text and is null for live', () => {
    expect(getRemovedStatusLabel('withdrawn')).toBe('Withdrawn');
    expect(getRemovedStatusLabel('scratched')).toBe('Scratched');
    expect(getRemovedStatusLabel('not_accepted')).toBe('Not accepted');
    expect(getRemovedStatusLabel('pending')).toBeNull();
    expect(getRemovedStatusLabel('moved')).toBeNull();
  });
});

describe('resolveClassSection — single phantom-A defense', () => {
  it('maps NULL/undefined to empty string, never "A"', () => {
    expect(resolveClassSection(null)).toBe('');
    expect(resolveClassSection(undefined)).toBe('');
  });
  it('keeps a real A/B section', () => {
    expect(resolveClassSection('A')).toBe('A');
    expect(resolveClassSection('B')).toBe('B');
  });
});

describe('getRefundLabel — prefers explicit columns, falls back to inference', () => {
  it('uses the explicit refund amount when present (secretary ground truth)', () => {
    expect(getRefundLabel({ paymentStatus: 'refunded', refundAmount: 30 })).toBe('Refunded $30');
    expect(getRefundLabel({ paymentStatus: 'refunded', refundAmount: 30.5 })).toBe('Refunded $30.50');
    expect(getRefundLabel({ paymentStatus: 'partial_refund', refundAmount: 15 })).toBe(
      'Partial refund $15'
    );
  });

  it('treats a refunded_at timestamp with no amount as a full refund', () => {
    expect(getRefundLabel({ paymentStatus: 'refunded', refundedAt: '2026-07-20T00:00:00Z' })).toBe(
      'Refunded'
    );
  });

  it('infers from payment_status when no explicit columns (exhibitor path)', () => {
    expect(getRefundLabel({ paymentStatus: 'refunded' })).toBe('Refunded');
    expect(getRefundLabel({ paymentStatus: 'partial_refund' })).toBe('Partial refund');
  });

  it('returns null when there is no refund', () => {
    expect(getRefundLabel({ paymentStatus: 'paid' })).toBeNull();
    expect(getRefundLabel({ paymentStatus: 'pending' })).toBeNull();
    expect(getRefundLabel({})).toBeNull();
  });
});

describe('composeClassTitle — section pinned, falls back to name', () => {
  it('composes a single-section class without a phantom letter', () => {
    expect(
      composeClassTitle({ element: 'Exterior', level: 'Excellent', section: null, name: 'X' })
    ).toBe('Exterior Excellent');
  });
  it('includes a real section', () => {
    expect(composeClassTitle({ element: 'Interior', level: 'Novice', section: 'A' })).toBe(
      'Interior Novice A'
    );
  });
  it('falls back to the stored name when parts are missing', () => {
    expect(composeClassTitle({ name: 'Container Novice A' })).toBe('Container Novice A');
    expect(composeClassTitle({})).toBe('');
  });
});

describe('getEntryDisplay — bundle, including malformed/cold-store safety', () => {
  // The 2026-06-18 walk fixture: Ranger / Exterior Excellent, withdrawn + refunded $30.
  it('renders the walk fixture consistently (withdrawn + refunded)', () => {
    const d = getEntryDisplay({
      entryStatus: 'withdrawn',
      paymentStatus: 'refunded',
      refundAmount: 30,
      class: { element: 'Exterior', level: 'Excellent', section: null, name: 'Exterior Excellent' },
    });
    expect(d.statusKind).toBe('withdrawn');
    expect(d.isRemoved).toBe(true);
    expect(d.removedLabel).toBe('Withdrawn');
    expect(d.refundLabel).toBe('Refunded $30');
    expect(d.section).toBe('');
    expect(d.classTitle).toBe('Exterior Excellent');
  });

  it('is safe for a class-less / null-status cold-store row (no terminal mislabel)', () => {
    const d = getEntryDisplay({ entryStatus: null, paymentStatus: null, class: null });
    expect(d.statusKind).toBe('unknown');
    expect(d.isRemoved).toBe(false); // must NOT render a removal/"Upcoming" label
    expect(d.removedLabel).toBeNull();
    expect(d.refundLabel).toBeNull();
    expect(d.section).toBe('');
    expect(d.classTitle).toBe('');
  });

  // Same raw row, fed as all three surfaces would feed it → one classification.
  it('classifies a row identically regardless of caller (no divergence)', () => {
    const raw = { entryStatus: 'cancelled', paymentStatus: 'refunded' };
    const a = getEntryDisplay(raw);
    const b = getEntryDisplay({ ...raw, class: { name: 'Whatever' } });
    expect(a.statusKind).toBe(b.statusKind);
    expect(a.isRemoved).toBe(true);
    expect(b.isRemoved).toBe(true);
  });
});
