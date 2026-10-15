/**
 * MYK9-645 round 4 — a dog in the "Not running" group offers no way to score.
 *
 * It did: the card kept its live Score button, and a score saved from there
 * vanished into a collapsed group and moved neither badge. `scoringDisabled`
 * removes the Score/Resume button, the scoresheet tap and the reset menu; the
 * status chip stays, so the existing check-in flow is still the way back and no
 * new action is introduced.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SortableEntryCard } from './SortableEntryCard';
import type { Entry } from '../../stores/entryStore';

vi.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => {},
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
}));

const DogCard = ({
  callName,
  primaryAction,
  actionButton,
  trailing,
  onClick,
  className,
}: {
  callName: string;
  primaryAction?: React.ReactNode;
  actionButton?: React.ReactNode;
  trailing?: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) => (
  <div data-testid="dog-card" data-classname={className} onClick={onClick}>
    <span>{callName}</span>
    {primaryAction}
    {actionButton}
    {trailing}
  </div>
);

function entry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: 'e1',
    classId: 'class-1',
    actualClassId: 'class-1',
    armband: 114,
    callName: 'Willow',
    breed: 'Beagle',
    handler: 'Jane Handler',
    isScored: false,
    status: 'no-status',
    inRing: false,
    checkedIn: false,
    className: 'Interior Advanced',
    element: 'Interior',
    level: 'Advanced',
    exhibitorOrder: 1,
    showPlacement: true,
    showQualification: true,
    showTime: true,
    showFaults: true,
    ...overrides,
  } as Entry;
}

function renderCard(
  scoringDisabled: boolean,
  handleEntryClick = vi.fn(),
  overrides: Partial<Entry> = {}
) {
  render(
    <SortableEntryCard
      entry={entry(overrides)}
      scoringDisabled={scoringDisabled}
      isDragMode={false}
      hasPermission={() => true}
      handleEntryClick={handleEntryClick}
      handleStatusClick={vi.fn()}
      handleResetMenuClick={vi.fn()}
      setSelfCheckinDisabledDialog={vi.fn()}
      DogCard={DogCard as never}
    />
  );
  return handleEntryClick;
}

describe('SortableEntryCard — scoringDisabled (MYK9-645)', () => {
  // MYK9-1086: the row tap IS the scoring action; there is no separate button.
  it('opens the scoresheet from the card tap when scoring is allowed', () => {
    const handleEntryClick = renderCard(false);
    // Only the focus-revealed keyboard control; nothing visible on the card.
    expect(screen.getByRole('button', { name: 'Score Willow' })).toHaveClass('sr-only');
    screen.getByTestId('dog-card').click();
    expect(handleEntryClick).toHaveBeenCalledTimes(1);
  });

  it('renders NO Score button when the row is not running', () => {
    renderCard(true);
    expect(screen.queryByRole('button', { name: 'Score Willow' })).not.toBeInTheDocument();
  });

  it('does not open the scoresheet when the card itself is tapped', () => {
    const handleEntryClick = renderCard(true);
    screen.getByTestId('dog-card').click();
    expect(handleEntryClick).not.toHaveBeenCalled();
  });

  it('keeps the status chip, so the existing check-in flow is still reachable', () => {
    renderCard(true);
    expect(screen.getByTitle('Change check-in')).toBeInTheDocument();
  });

  // MYK9-645 round 5: a dog SCORED and then withdrawn lands in the group with
  // `isScored` true. It used to get neither the chip (gated on `!isScored`) nor
  // Reset (gated on scoring), so there was no way back out of the group at all.
  it('keeps the chip for a SCORED row inside the group, so there is still a way back', () => {
    renderCard(true, vi.fn(), { isScored: true });

    expect(screen.getByTitle('Change check-in')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Score options/i })).not.toBeInTheDocument();
  });

  it('still shows Reset rather than the chip for a scored row that IS scorable', () => {
    renderCard(false, vi.fn(), { isScored: true });

    expect(screen.getByRole('button', { name: /Score options/i })).toBeInTheDocument();
    expect(screen.queryByTitle('Change check-in')).not.toBeInTheDocument();
  });

  it('drops the clickable affordance class', () => {
    renderCard(true);
    expect(screen.getByTestId('dog-card').getAttribute('data-classname') ?? '').not.toContain(
      'clickable'
    );
  });
});

// MYK9-1162: a held entry keeps its run-order place and says why. It cannot be
// timed or scored, but the card still opens its scoresheet route, where the
// judge can record the dog absent.
describe('SortableEntryCard: awaiting a registration number (MYK9-1162)', () => {
  it('shows the label and keeps the card tappable, with no Score wording', () => {
    const handleEntryClick = renderCard(false, vi.fn(), { awaitingRegistrationNumber: true });

    expect(screen.getByText('Registration number needed')).toBeInTheDocument();
    expect(screen.getByText('See the secretary')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Score Willow' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Willow' })).toBeInTheDocument();
    screen.getByTestId('dog-card').click();
    expect(handleEntryClick).toHaveBeenCalledTimes(1);
  });

  it('keeps the status chip so the dog stays in the existing check-in flow', () => {
    renderCard(false, vi.fn(), { awaitingRegistrationNumber: true });
    expect(screen.getByTitle('Change check-in')).toBeInTheDocument();
  });

  it('is unchanged when the flag is absent or false (unknown is not held)', () => {
    renderCard(false);
    expect(screen.queryByText('Registration number needed')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Score Willow' })).toBeInTheDocument();
  });
});
