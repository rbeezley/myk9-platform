/**
 * MYK9-1012 — a spot another exhibitor is paying for reads as an ordinary
 * taken spot.
 *
 * The server folds unexpired holds into the class's taken count
 * (`get_show_class_availability`, migration 20261004235300), so a class whose
 * last spot is held arrives here as full. Other exhibitors see Full, or the
 * wait list when the class has one, and never a held count or hold wording.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { ClassAvailability } from '../ClassAvailability';
import type { ClassAvailability as ClassAvailabilityData } from '@/hooks/useClassAvailability';
import { describeCartFullReason } from '@/features/payments/cartFullReasonCopy';

vi.mock('@/hooks/useClassAvailability', () => ({
  useClassAvailability: () => ({ classes: [] }),
}));

// One spot, entered by nobody yet, held by another exhibitor at Pay: the
// server reports it taken.
function heldLastSpot(overrides: Partial<ClassAvailabilityData> = {}): ClassAvailabilityData {
  return {
    classId: 'c1',
    className: 'Container Novice A',
    element: 'Container',
    level: 'Novice',
    section: 'A',
    status: 'upcoming',
    hasStarted: false,
    trialId: 't1',
    trialName: 'Trial 1',
    trialDate: '2026-11-01',
    entryLimit: 1,
    currentEntries: 1,
    spotsAvailable: 0,
    waitlistCount: 0,
    isFull: true,
    hasWaitlist: false,
    allowsWaitlist: false,
    judgeId: null,
    judgeDayFull: false,
    judgeDayAvailable: 0,
    ...overrides,
  };
}

function renderWith(cls: ClassAvailabilityData) {
  return render(
    <ClassAvailability
      showId="show-1"
      onEnterClass={vi.fn()}
      prefetchedData={{
        classes: [cls],
        isLoading: false,
        error: null,
        totalSpotsAvailable: 0,
        fullClasses: 1,
      }}
    />
  );
}

const HOLD_WORDING = /\bhold|\bheld/i;

describe('ClassAvailability — a held spot is just taken (MYK9-1012)', () => {
  it('shows Full with no hold wording when the class takes no wait list', () => {
    const { container } = renderWith(heldLastSpot());
    expect(screen.getAllByText('Full').length).toBeGreaterThan(0);
    expect(container.textContent).not.toMatch(HOLD_WORDING);
  });

  it('offers the usual wait list, with no hold wording, when the class has one', () => {
    const { container } = renderWith(heldLastSpot({ allowsWaitlist: true }));
    expect(screen.getByRole('button', { name: /join waitlist/i })).toBeEnabled();
    expect(container.textContent).not.toMatch(HOLD_WORDING);
  });

  it('says a full cart line has no spots left, never that one is held', () => {
    expect(describeCartFullReason({ kind: 'class' })).toBe(
      'This class has no spots left right now.'
    );
    expect(describeCartFullReason({ kind: 'class' })).not.toMatch(HOLD_WORDING);
  });
});
