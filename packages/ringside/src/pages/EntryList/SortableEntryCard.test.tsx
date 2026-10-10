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
  primaryAction,
  dragHandle,
  favoriteButton,
  resultBadges,
  trailing,
  nameAddon,
  variant,
}) => (
  <div
    data-testid="dog-card"
    data-armband={armband}
    data-class-name={className}
    data-status-border={statusBorder ?? ''}
    data-variant={variant ?? ''}
    onClick={onClick}
  >
    <span>{callName}</span>
    {dragHandle && <div data-testid="drag-handle-slot">{dragHandle}</div>}
    {nameAddon && <div data-testid="name-addon-slot">{nameAddon}</div>}
    {actionButton && <div data-testid="action-button-slot">{actionButton}</div>}
    {trailing && <div data-testid="action-button-slot">{trailing}</div>}
    {primaryAction && <div data-testid="primary-action-slot">{primaryAction}</div>}
    {favoriteButton && <div data-testid="favorite-button-slot">{favoriteButton}</div>}
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
    expect(screen.queryByTestId('reset-menu-button')).toBeNull();
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
    expect(screen.getByTestId('reset-menu-button')).not.toBeNull();
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
    expect(resetButton.className).toContain('sm:min-h-12');
    expect(resetButton.className).toContain('sm:min-w-12');
  });

  /**
   * The status pill is the most-used steward control here and it was a
   * `<div onClick>` — no role, no tabIndex, no key handler — so a keyboard or
   * switch-control user could not change a dog's check-in status at all, and a
   * screen reader announced it as static text.
   */
  it('renders the check-in status pill as a real button, not a clickable div', () => {
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

    const pill = screen.getByTitle('Change check-in');
    expect(pill.tagName).toBe('BUTTON');
    expect(pill.className).toContain('focus-visible:ring-2');
  });

  it('activates the status pill via its button semantics', () => {
    const handleStatusClick = vi.fn();
    renderInDndContext(
      <SortableEntryCard
        entry={baseEntry}
        isDragMode={false}
        hasPermission={allowAll}
        handleEntryClick={vi.fn()}
        handleStatusClick={handleStatusClick}
        handleResetMenuClick={vi.fn()}
        setSelfCheckinDisabledDialog={vi.fn()}
        DogCard={StubDogCard}
      />
    );

    const pill = screen.getByTitle('Change check-in');
    pill.focus();
    expect(document.activeElement).toBe(pill);

    fireEvent.click(pill);
    expect(handleStatusClick).toHaveBeenCalled();
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
    expect(screen.queryByTestId('reset-menu-button')).toBeNull();
    // The result itself still shows (MYK9-1086); only the reset control is gone.
    expect(screen.getByTestId('completed-result')).toBeTruthy();
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

  // MYK9-1086: the big Score/Resume button is gone; the whole row is the tap target.
  it('renders no separate Score button for a scorer', () => {
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

    expect(screen.queryByRole('button', { name: 'Score Rex' })).toBeNull();
    expect(screen.queryByTestId('primary-action-slot')).toBeNull();
  });

  it('shows Resume on the in-ring hero for a scorer and navigates once on tap', () => {
    const onEntryClick = vi.fn();
    const inRing: Entry = { ...baseEntry, inRing: true, status: 'in-ring' };
    renderInDndContext(
      <SortableEntryCard
        entry={inRing}
        variant="hero"
        isDragMode={false}
        hasPermission={allowAll}
        handleEntryClick={onEntryClick}
        handleStatusClick={vi.fn()}
        handleResetMenuClick={vi.fn()}
        setSelfCheckinDisabledDialog={vi.fn()}
        DogCard={StubDogCard}
      />
    );

    expect(screen.getByTestId('dog-card').getAttribute('data-variant')).toBe('hero');
    expect(screen.getByText('Resume')).toBeTruthy();
    fireEvent.click(screen.getByTestId('dog-card'));
    expect(onEntryClick).toHaveBeenCalledTimes(1);
  });

  it('keeps the check-in button on the hero and no own-dog tint over its fill', () => {
    const inRing: Entry = { ...baseEntry, inRing: true, status: 'in-ring' };
    renderInDndContext(
      <SortableEntryCard
        entry={inRing}
        variant="hero"
        isOwnEntry
        isDragMode={false}
        hasPermission={allowAll}
        handleEntryClick={vi.fn()}
        handleStatusClick={vi.fn()}
        handleResetMenuClick={vi.fn()}
        setSelfCheckinDisabledDialog={vi.fn()}
        DogCard={StubDogCard}
      />
    );

    expect(screen.getByTestId('check-in-button')).toBeTruthy();
    expect(screen.getByTestId('dog-card').getAttribute('data-class-name')).not.toContain(
      'bg-primary/'
    );
  });

  it('shows no Resume on the hero for a viewer who cannot score', () => {
    const inRing: Entry = { ...baseEntry, inRing: true, status: 'in-ring' };
    renderInDndContext(
      <SortableEntryCard
        entry={inRing}
        variant="hero"
        isDragMode={false}
        hasPermission={denyAll}
        handleEntryClick={vi.fn()}
        handleStatusClick={vi.fn()}
        handleResetMenuClick={vi.fn()}
        setSelfCheckinDisabledDialog={vi.fn()}
        DogCard={StubDogCard}
      />
    );

    expect(screen.queryByText('Resume')).toBeNull();
  });

  it('keeps the explicit score action out of the DOM when scoring is denied', () => {
    renderInDndContext(
      <SortableEntryCard
        entry={baseEntry}
        isDragMode={false}
        hasPermission={denyAll}
        handleEntryClick={vi.fn()}
        handleStatusClick={vi.fn()}
        handleResetMenuClick={vi.fn()}
        setSelfCheckinDisabledDialog={vi.fn()}
        DogCard={StubDogCard}
      />
    );

    expect(screen.queryByRole('button', { name: 'Score Rex' })).toBeNull();
  });

  it('toggles favorite without firing card navigation', () => {
    const onEntryClick = vi.fn();
    const onToggleFavorite = vi.fn();
    renderInDndContext(
      <SortableEntryCard
        entry={baseEntry}
        isDragMode={false}
        hasPermission={(p => p !== 'canScore') as (p: EntryListPermission) => boolean}
        handleEntryClick={onEntryClick}
        handleStatusClick={vi.fn()}
        handleResetMenuClick={vi.fn()}
        setSelfCheckinDisabledDialog={vi.fn()}
        onToggleFavorite={onToggleFavorite}
        DogCard={StubDogCard}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Favorite Rex' }));

    expect(onToggleFavorite).toHaveBeenCalledWith(42);
    expect(onEntryClick).not.toHaveBeenCalled();
  });

  it('hides the favorite heart from a scorer (MYK9-1086)', () => {
    renderInDndContext(
      <SortableEntryCard
        entry={baseEntry}
        isDragMode={false}
        hasPermission={allowAll}
        handleEntryClick={vi.fn()}
        handleStatusClick={vi.fn()}
        handleResetMenuClick={vi.fn()}
        setSelfCheckinDisabledDialog={vi.fn()}
        onToggleFavorite={vi.fn()}
        DogCard={StubDogCard}
      />
    );

    expect(screen.queryByRole('button', { name: 'Favorite Rex' })).toBeNull();
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
