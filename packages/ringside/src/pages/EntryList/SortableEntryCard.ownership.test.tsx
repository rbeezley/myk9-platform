/**
 * Ownership rendering tests for SortableEntryCard: the own-dog highlight,
 * the queue pill, and the conflict chip. Mirrors the StubDogCard pattern
 * from SortableEntryCard.test.tsx.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import type { ComponentType } from 'react';
import type { Entry } from '../../stores/entryStore';
import type { DogCardProps } from './pageProps';
import type { EntryListPermission } from './permissions';
import { SortableEntryCard } from './SortableEntryCard';

const StubDogCard: ComponentType<DogCardProps> = ({ callName, className, resultBadges }) => (
  <div data-testid="dog-card" data-class-name={className}>
    <span>{callName}</span>
    {resultBadges && <div data-testid="result-badges-slot">{resultBadges}</div>}
  </div>
);

const baseEntry: Entry = {
  id: 'e1',
  classId: 'class-1',
  armband: 42,
  callName: 'Ditto',
  breed: 'Mixed Breed',
  handler: 'Sherry Thompson',
  status: undefined,
  inRing: false,
  isScored: false,
} as unknown as Entry;

const allowAll = (() => true) as (p: EntryListPermission) => boolean;

const renderCard = (extraProps: Record<string, unknown> = {}) =>
  render(
    <DndContext>
      <SortableContext items={[baseEntry.id]}>
        <SortableEntryCard
          entry={baseEntry}
          isDragMode={false}
          hasPermission={allowAll}
          handleEntryClick={vi.fn()}
          handleStatusClick={vi.fn()}
          handleResetMenuClick={vi.fn()}
          setSelfCheckinDisabledDialog={vi.fn()}
          DogCard={StubDogCard}
          {...extraProps}
        />
      </SortableContext>
    </DndContext>
  );

describe('SortableEntryCard ownership annotations', () => {
  it('renders nothing extra without ownership props (regression guard)', () => {
    renderCard();
    expect(screen.queryByTestId('own-dog-queue-pill')).toBeNull();
    expect(screen.queryByTestId('own-dog-conflict-chip')).toBeNull();
    expect(screen.getByTestId('dog-card').getAttribute('data-class-name')).not.toContain(
      'ring-primary'
    );
  });

  it('highlights the card and shows the queue pill for an own entry', () => {
    renderCard({ isOwnEntry: true, dogsAhead: { kind: 'waiting', dogsAhead: 0 } });
    expect(screen.getByTestId('dog-card').getAttribute('data-class-name')).toContain(
      'ring-primary'
    );
    expect(screen.getByTestId('own-dog-queue-pill').textContent).toBe("You're next");
  });

  it('shows the in-ring pill state', () => {
    renderCard({ isOwnEntry: true, dogsAhead: { kind: 'in-ring' } });
    expect(screen.getByTestId('own-dog-queue-pill').textContent).toBe('In the ring');
  });

  it('keeps the highlight but drops the pill once scored (dogsAhead null)', () => {
    renderCard({ isOwnEntry: true, dogsAhead: null });
    expect(screen.getByTestId('dog-card').getAttribute('data-class-name')).toContain(
      'ring-primary'
    );
    expect(screen.queryByTestId('own-dog-queue-pill')).toBeNull();
  });

  it('renders the conflict chip only for own entries with a label', () => {
    renderCard({
      isOwnEntry: true,
      dogsAhead: { kind: 'waiting', dogsAhead: 2 },
      conflictLabel: 'Also 1 away in Container Master',
    });
    expect(screen.getByTestId('own-dog-conflict-chip').textContent).toBe(
      'Also 1 away in Container Master'
    );
  });

  it('never renders the conflict chip for non-own entries even if a label leaks through', () => {
    renderCard({ conflictLabel: 'Also 1 away in Container Master' });
    expect(screen.queryByTestId('own-dog-conflict-chip')).toBeNull();
  });
});
