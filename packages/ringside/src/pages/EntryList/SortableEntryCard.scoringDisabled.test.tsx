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
  onClick,
  className,
}: {
  callName: string;
  primaryAction?: React.ReactNode;
  actionButton?: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) => (
  <div data-testid="dog-card" data-classname={className} onClick={onClick}>
    <span>{callName}</span>
    {primaryAction}
    {actionButton}
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

function renderCard(scoringDisabled: boolean, handleEntryClick = vi.fn()) {
  render(
    <SortableEntryCard
      entry={entry()}
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
  it('renders the Score button when scoring is allowed', () => {
    renderCard(false);
    expect(screen.getByRole('button', { name: 'Score Willow' })).toBeInTheDocument();
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
    expect(screen.getByTitle('Tap to change status')).toBeInTheDocument();
  });

  it('drops the clickable affordance class', () => {
    renderCard(true);
    expect(screen.getByTestId('dog-card').getAttribute('data-classname') ?? '').not.toContain(
      'clickable'
    );
  });
});
