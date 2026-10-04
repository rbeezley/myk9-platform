/**
 * MYK9-1013 — the Join Waitlist option says joining is free.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { ClassAvailability } from '../ClassAvailability';
import type { ClassAvailability as ClassAvailabilityData } from '@/hooks/useClassAvailability';

vi.mock('@/hooks/useClassAvailability', () => ({
  useClassAvailability: () => ({ classes: [] }),
}));

const NOTE = 'Joining the waitlist is free. You only pay if a spot opens and you claim it.';

function makeClass(overrides: Partial<ClassAvailabilityData>): ClassAvailabilityData {
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
    entryLimit: 10,
    currentEntries: 10,
    spotsAvailable: 0,
    waitlistCount: 2,
    isFull: true,
    hasWaitlist: true,
    allowsWaitlist: true,
    judgeId: 'j1',
    judgeDayFull: true,
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
        totalSpotsAvailable: cls.spotsAvailable,
        fullClasses: cls.isFull ? 1 : 0,
      }}
    />
  );
}

describe('ClassAvailability — waitlist is free (MYK9-1013)', () => {
  it('says joining is free next to the Join Waitlist button', () => {
    renderWith(makeClass({}));
    expect(screen.getByRole('button', { name: /join waitlist/i })).toBeInTheDocument();
    expect(screen.getByText(NOTE)).toBeInTheDocument();
  });

  it('says nothing about waitlists on a class with room', () => {
    renderWith(makeClass({ isFull: false, spotsAvailable: 5, currentEntries: 5 }));
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
  });

  it('says nothing when the class is full and has no waitlist', () => {
    renderWith(makeClass({ allowsWaitlist: false }));
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
  });
});
