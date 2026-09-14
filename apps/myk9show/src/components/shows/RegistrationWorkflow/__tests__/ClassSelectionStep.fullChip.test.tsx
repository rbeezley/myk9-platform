/**
 * MYK9-515 — a full chip must carry a reason and a route forward.
 *
 * `buildFullChipReason` is unit-tested next to the module. This file pins the
 * render: that the sentence is visible, that it is attached to the chip through
 * `aria-describedby` (a sighted reader and a screen-reader user must get the
 * same explanation), and that a started class's reason still wins over it.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { ElementCard } from '@/components/shows/RegistrationWorkflow/ClassSelectionStep.components';
import type { LevelInfo } from '@/components/shows/RegistrationWorkflow/ClassSelectionStep.types';

const baseLevel: LevelInfo = {
  classId: 'c1',
  level: 'Advanced',
  section: undefined,
  displayLabel: 'Advanced',
  isSelected: false,
  isAlreadyEntered: false,
};

const REASON = "The judge's Saturday is full. Sunday's Interior Advanced still has space.";

function renderCard(levels: LevelInfo[], isSingleClass = false) {
  return render(
    <ElementCard
      element="Interior"
      levels={levels}
      fee={30}
      isSingleClass={isSingleClass}
      onToggle={vi.fn()}
    />
  );
}

describe('ElementCard — full chip reason (MYK9-515)', () => {
  it('shows the reason next to a full chip', () => {
    renderCard([{ ...baseLevel, isFull: true, allowsWaitlist: false, fullReason: REASON }]);
    expect(screen.getByText(REASON)).toBeInTheDocument();
  });

  it('attaches the reason to the chip for a screen reader', () => {
    renderCard([{ ...baseLevel, isFull: true, allowsWaitlist: false, fullReason: REASON }]);
    const describedBy = screen.getByRole('checkbox').getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)?.textContent).toBe(REASON);
  });

  it('shows the reason alongside the wait-list badge, which says nothing about why', () => {
    const waitlistReason = "The judge's Saturday is full — you can join the wait list.";
    renderCard([
      {
        ...baseLevel,
        isFull: true,
        allowsWaitlist: true,
        waitlistCount: 2,
        fullReason: waitlistReason,
      },
    ]);
    expect(screen.getByText('Full: join wait list')).toBeInTheDocument();
    expect(screen.getByText(waitlistReason)).toBeInTheDocument();
  });

  it('renders nothing extra for a class that is not full', () => {
    renderCard([{ ...baseLevel, isFull: false, fullReason: REASON }]);
    expect(screen.queryByText(REASON)).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox')).not.toHaveAttribute('aria-describedby');
  });

  it('suppresses the reason for a class the exhibitor is already entered in', () => {
    renderCard([{ ...baseLevel, isFull: true, isAlreadyEntered: true, fullReason: REASON }]);
    expect(screen.queryByText(REASON)).not.toBeInTheDocument();
  });

  it('lets a started class outrank a full one — it takes nothing, not even a wait list', () => {
    renderCard([
      {
        ...baseLevel,
        isFull: true,
        allowsWaitlist: true,
        fullReason: REASON,
        isClassClosed: true,
        classClosedReason: 'This class has started',
      },
    ]);
    expect(screen.getByText('This class has started')).toBeInTheDocument();
    expect(screen.queryByText(REASON)).not.toBeInTheDocument();
  });

  it('explains a full single-class element too', () => {
    renderCard(
      [
        {
          classId: 's1',
          level: '',
          section: undefined,
          displayLabel: '',
          isSelected: false,
          isAlreadyEntered: false,
          isFull: true,
          allowsWaitlist: false,
          fullReason: REASON,
        },
      ],
      true
    );
    expect(screen.getByText(REASON)).toBeInTheDocument();
    const describedBy = screen.getByRole('checkbox').getAttribute('aria-describedby');
    expect(document.getElementById(describedBy!)?.textContent).toBe(REASON);
  });
});

describe('ElementCard — a closed class that is already selected (MYK9-516)', () => {
  const CLOSED = { isClassClosed: true, classClosedReason: 'This class has started' } as const;

  it('stays operable so a stale cart line can be removed', async () => {
    // The class started AFTER it went in the cart. Payment now refuses the whole
    // submission, and a disabled checkbox is the one control that would fix it.
    const onToggle = vi.fn();
    const { user } = render(
      <ElementCard
        element="Interior"
        levels={[{ ...baseLevel, isSelected: true, ...CLOSED }]}
        fee={30}
        isSingleClass={false}
        onToggle={onToggle}
      />
    );

    expect(screen.getByRole('checkbox')).not.toHaveAttribute('aria-disabled', 'true');
    await user.click(screen.getByText('Advanced'));
    expect(onToggle).toHaveBeenCalledWith('c1');
  });

  it('is still disabled when it is NOT selected', () => {
    render(
      <ElementCard
        element="Interior"
        levels={[{ ...baseLevel, isSelected: false, ...CLOSED }]}
        fee={30}
        isSingleClass={false}
        onToggle={vi.fn()}
      />
    );
    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-disabled', 'true');
  });
});
