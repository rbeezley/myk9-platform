/**
 * Smoke tests for `SortableEntryCard` (PR E2d-2b).
 *
 * Scope: locks the slot contract end-to-end, the long-press → drag
 * mode entry, and the conditional drag handle / status badge / reset
 * button rendering. Does NOT exercise dnd-kit's internal drag
 * mechanics — those are covered by the library.
 *
 * Pattern matches the existing dialogSlots.test.tsx: stub the
 * `DogCard` slot to render minimal markup that surfaces the props
 * passed in, then assert on what the page would render. Uses vanilla
 * vitest assertions (no @testing-library/jest-dom in ringside).
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import type { ComponentType } from 'react';
import type { Entry } from '../../stores/entryStore';
import type { DogCardProps } from './pageProps';
import type { EntryListPermission } from './permissions';
import { SortableEntryCard } from './SortableEntryCard';

// Stub DogCard that surfaces the props passed in so we can assert on
// them. Real DogCard lives in apps/myk9q/src/components/DogCard.tsx.
const StubDogCard: ComponentType<DogCardProps> = ({
  armband,
  callName,
  onClick,
  className,
  statusBorder,
  actionButton,
  dragHandle,
  resultBadges,
}) => (
  <div
    data-testid="dog-card"
    data-armband={armband}
    data-class-name={className}
    data-status-border={statusBorder ?? ''}
    onClick={onClick}
  >
    <span>{callName}</span>
    {dragHandle && <div data-testid="drag-handle-slot">{dragHandle}</div>}
    {actionButton && <div data-testid="action-button-slot">{actionButton}</div>}
    {resultBadges && <div data-testid="result-badges-slot">{resultBadges}</div>}
  </div>
);

const baseEntry: Entry = {
  id: '1',
  classId: '100',
  armband: 42,
  callName: 'Rex',
  breed: 'Labrador',
  handler: 'Alice',
  status: undefined,
  inRing: false,
  isScored: false,
  checkinStatus: undefined,
  section: null,
  element: 'Container',
  level: 'Novice',
} as unknown as Entry;

const allowAll = (() => true) as (p: EntryListPermission) => boolean;
const denyAll = (() => false) as (p: EntryListPermission) => boolean;

// dnd-kit's useSortable must be called within a SortableContext + DndContext.
const renderInDndContext = (ui: React.ReactNode) =>
  render(
    <DndContext>
      <SortableContext items={[baseEntry.id]}>{ui}</SortableContext>
    </DndContext>
  );

describe('SortableEntryCard', () => {
  it('renders the DogCard slot with armband + call name', () => {
    renderInDndContext(
      <SortableEntryCard
        entry={baseEntry}
        isDragMode={false}
        hasPermission={allowAll}
        handleEntryClick={vi.fn()}
        handleStatusClick={vi.fn()}
        handleResetMenuClick={vi.fn()}
        setSelfCheckinDisabledDialog={vi.fn()}
        DogCard={StubDogCard}
      />
    );
    const card = screen.getByTestId('dog-card');
    expect(card.getAttribute('data-armband')).toBe('42');
    expect(screen.getByText('Rex')).not.toBeNull();
  });

  it('shows a status badge action button for unscored entries', () => {
    renderInDndContext(
      <SortableEntryCard
        entry={baseEntry}
        isDragMode={false}
        hasPermission={allowAll}
        handleEntryClick={vi.fn()}
        handleStatusClick={vi.fn()}
        handleResetMenuClick={vi.fn()}
        setSelfCheckinDisabledDialog={vi.fn()}
        DogCard={StubDogCard}
      />
    );
    // Unscored entry → status badge slot occupied; reset button not present.
    expect(screen.getByTestId('action-button-slot')).not.toBeNull();
    expect(screen.queryByLabelText('More options')).toBeNull();
  });

  it('shows a reset button (not a status badge) for scored entries when permitted', () => {
    const scored: Entry = { ...baseEntry, isScored: true };
    renderInDndContext(
      <SortableEntryCard
        entry={scored}
        isDragMode={false}
        hasPermission={allowAll}
        handleEntryClick={vi.fn()}
        handleStatusClick={vi.fn()}
        handleResetMenuClick={vi.fn()}
        setSelfCheckinDisabledDialog={vi.fn()}
        DogCard={StubDogCard}
      />
    );
    expect(screen.getByLabelText('More options')).not.toBeNull();
  });

  it('renders the reset button with self-contained touch-target styling', () => {
    const scored: Entry = { ...baseEntry, isScored: true };
    renderInDndContext(
      <SortableEntryCard
        entry={scored}
        isDragMode={false}
        hasPermission={allowAll}
        handleEntryClick={vi.fn()}
        handleStatusClick={vi.fn()}
        handleResetMenuClick={vi.fn()}
        setSelfCheckinDisabledDialog={vi.fn()}
        DogCard={StubDogCard}
      />
    );

    const resetButton = screen.getByTestId('reset-menu-button');
    expect(resetButton.className).toContain('reset-menu-button');
    expect(resetButton.className).toContain('min-h-11');
    expect(resetButton.className).toContain('min-w-11');
  });

  it('omits the reset button for scored entries when canScore is denied', () => {
    const scored: Entry = { ...baseEntry, isScored: true };
    renderInDndContext(
      <SortableEntryCard
        entry={scored}
        isDragMode={false}
        hasPermission={denyAll}
        handleEntryClick={vi.fn()}
        handleStatusClick={vi.fn()}
        handleResetMenuClick={vi.fn()}
        setSelfCheckinDisabledDialog={vi.fn()}
        DogCard={StubDogCard}
      />
    );
    expect(screen.queryByLabelText('More options')).toBeNull();
    expect(screen.queryByTestId('action-button-slot')).toBeNull();
  });

  it('renders a drag handle slot in drag mode for entries not in-ring', () => {
    renderInDndContext(
      <SortableEntryCard
        entry={baseEntry}
        isDragMode={true}
        hasPermission={allowAll}
        handleEntryClick={vi.fn()}
        handleStatusClick={vi.fn()}
        handleResetMenuClick={vi.fn()}
        setSelfCheckinDisabledDialog={vi.fn()}
        DogCard={StubDogCard}
      />
    );
    expect(screen.getByTestId('drag-handle-slot')).not.toBeNull();
  });

  it('hides the drag handle for in-ring entries even when drag mode is on', () => {
    const inRing: Entry = { ...baseEntry, inRing: true };
    renderInDndContext(
      <SortableEntryCard
        entry={inRing}
        isDragMode={true}
        hasPermission={allowAll}
        handleEntryClick={vi.fn()}
        handleStatusClick={vi.fn()}
        handleResetMenuClick={vi.fn()}
        setSelfCheckinDisabledDialog={vi.fn()}
        DogCard={StubDogCard}
      />
    );
    expect(screen.queryByTestId('drag-handle-slot')).toBeNull();
  });

  it('routes a status badge click to handleStatusClick when self-checkin is enabled', () => {
    const onStatusClick = vi.fn();
    renderInDndContext(
      <SortableEntryCard
        entry={baseEntry}
        isDragMode={false}
        classInfo={{ selfCheckin: true }}
        hasPermission={denyAll /* no canCheckInDogs */}
        handleEntryClick={vi.fn()}
        handleStatusClick={onStatusClick}
        handleResetMenuClick={vi.fn()}
        setSelfCheckinDisabledDialog={vi.fn()}
        DogCard={StubDogCard}
      />
    );
    const badge = screen.getByTestId('action-button-slot').firstChild as HTMLElement;
    fireEvent.click(badge);
    expect(onStatusClick).toHaveBeenCalledTimes(1);
    expect(onStatusClick.mock.calls[0][1]).toBe(baseEntry.id);
  });

  it('opens self-checkin-disabled dialog when neither canCheckIn nor selfCheckin permits the click', () => {
    const setDialog = vi.fn();
    const onStatusClick = vi.fn();
    renderInDndContext(
      <SortableEntryCard
        entry={baseEntry}
        isDragMode={false}
        classInfo={{ selfCheckin: false }}
        hasPermission={denyAll}
        handleEntryClick={vi.fn()}
        handleStatusClick={onStatusClick}
        handleResetMenuClick={vi.fn()}
        setSelfCheckinDisabledDialog={setDialog}
        DogCard={StubDogCard}
      />
    );
    fireEvent.click(screen.getByTestId('action-button-slot').firstChild as HTMLElement);
    expect(setDialog).toHaveBeenCalledWith(true);
    expect(onStatusClick).not.toHaveBeenCalled();
  });

  it('fires handleEntryClick on card click when canScore is allowed and not in drag mode', () => {
    const onEntryClick = vi.fn();
    renderInDndContext(
      <SortableEntryCard
        entry={baseEntry}
        isDragMode={false}
        hasPermission={allowAll}
        handleEntryClick={onEntryClick}
        handleStatusClick={vi.fn()}
        handleResetMenuClick={vi.fn()}
        setSelfCheckinDisabledDialog={vi.fn()}
        DogCard={StubDogCard}
      />
    );
    fireEvent.click(screen.getByTestId('dog-card'));
    expect(onEntryClick).toHaveBeenCalledWith(baseEntry);
  });

  it('suppresses card click navigation while in drag mode', () => {
    const onEntryClick = vi.fn();
    renderInDndContext(
      <SortableEntryCard
        entry={baseEntry}
        isDragMode={true}
        hasPermission={allowAll}
        handleEntryClick={onEntryClick}
        handleStatusClick={vi.fn()}
        handleResetMenuClick={vi.fn()}
        setSelfCheckinDisabledDialog={vi.fn()}
        DogCard={StubDogCard}
      />
    );
    fireEvent.click(screen.getByTestId('dog-card'));
    expect(onEntryClick).not.toHaveBeenCalled();
  });
});
