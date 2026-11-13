/**
 * MYK9-1807 / MYK9-1809: what the card's status control does for the viewer the host describes.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import type { ComponentType } from 'react';
import type { Entry } from '../../stores/entryStore';
import type { DogCardProps, EntryStatusControl } from './pageProps';
import type { EntryListPermission } from './permissions';
import { SortableEntryCard } from './SortableEntryCard';

const StubDogCard: ComponentType<DogCardProps> = ({ callName, trailing }) => (
  <div data-testid="dog-card">
    <span>{callName}</span>
    {trailing}
  </div>
);

const entry = {
  id: 'e1',
  classId: 'class-1',
  armband: 42,
  callName: 'Ditto',
  breed: 'Mixed Breed',
  handler: 'Sherry Thompson',
  status: 'checked-in',
  inRing: false,
  isScored: false,
} as unknown as Entry;

function renderCard(props: {
  statusControl?: EntryStatusControl;
  canCheckIn?: boolean;
  classInfo?: { selfCheckin?: boolean };
}) {
  const handleStatusClick = vi.fn();
  const setSelfCheckinDisabledDialog = vi.fn();
  const hasPermission = ((p: EntryListPermission) =>
    p === 'canCheckInDogs' ? (props.canCheckIn ?? true) : false) as (
    p: EntryListPermission
  ) => boolean;
  render(
    <DndContext>
      <SortableContext items={[entry.id]}>
        <SortableEntryCard
          entry={entry}
          isDragMode={false}
          hasPermission={hasPermission}
          handleEntryClick={vi.fn()}
          handleStatusClick={handleStatusClick}
          handleResetMenuClick={vi.fn()}
          setSelfCheckinDisabledDialog={setSelfCheckinDisabledDialog}
          DogCard={StubDogCard}
          {...(props.classInfo ? { classInfo: props.classInfo } : {})}
          {...(props.statusControl ? { statusControl: props.statusControl } : {})}
        />
      </SortableContext>
    </DndContext>
  );
  return { handleStatusClick, setSelfCheckinDisabledDialog };
}

describe('SortableEntryCard status control', () => {
  it('open: the control changes the status', () => {
    const { handleStatusClick } = renderCard({ statusControl: 'open' });
    fireEvent.click(screen.getByTestId('check-in-button'));
    expect(handleStatusClick).toHaveBeenCalledWith(expect.anything(), 'e1');
  });

  it('none: shows the status but offers no control', () => {
    renderCard({ statusControl: 'none' });
    expect(screen.queryByTestId('check-in-button')).toBeNull();
    expect(screen.getByTestId('check-in-status')).not.toBeNull();
    expect(screen.queryByTestId('reinstate-notice')).toBeNull();
  });

  it('self-checkin-off: the control opens the "self check-in is off" dialog', () => {
    const { handleStatusClick, setSelfCheckinDisabledDialog } = renderCard({
      statusControl: 'self-checkin-off',
    });
    fireEvent.click(screen.getByTestId('check-in-button'));
    expect(setSelfCheckinDisabledDialog).toHaveBeenCalledWith(true);
    expect(handleStatusClick).not.toHaveBeenCalled();
  });

  it('reinstate: no control, and the row says the secretary must reinstate the entry', () => {
    renderCard({ statusControl: 'reinstate' });
    expect(screen.queryByTestId('check-in-button')).toBeNull();
    expect(screen.getByTestId('reinstate-notice').textContent).toContain(
      'The show secretary must reinstate this entry before it can be checked in.'
    );
  });

  it('reinstate-staff: no control, and the row points staff to Entry management', () => {
    renderCard({ statusControl: 'reinstate-staff' });
    expect(screen.queryByTestId('check-in-button')).toBeNull();
    expect(screen.getByTestId('reinstate-notice').textContent).toContain(
      'Reinstate this entry in Entry management first.'
    );
  });

  describe('with no host answer (staff behavior unchanged)', () => {
    it('a staff member opens the status control even while self check-in is off', () => {
      const { handleStatusClick } = renderCard({ classInfo: { selfCheckin: false } });
      fireEvent.click(screen.getByTestId('check-in-button'));
      expect(handleStatusClick).toHaveBeenCalled();
    });

    it('a viewer who cannot check dogs in gets the "self check-in is off" dialog when it is off', () => {
      const { handleStatusClick, setSelfCheckinDisabledDialog } = renderCard({
        canCheckIn: false,
        classInfo: { selfCheckin: false },
      });
      fireEvent.click(screen.getByTestId('check-in-button'));
      expect(setSelfCheckinDisabledDialog).toHaveBeenCalledWith(true);
      expect(handleStatusClick).not.toHaveBeenCalled();
    });
  });
});
