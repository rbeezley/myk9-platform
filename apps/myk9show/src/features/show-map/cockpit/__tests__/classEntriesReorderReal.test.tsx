import { StrictMode } from 'react';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { render } from '@/test/utils/testUtils';
import { ClassEntriesTable } from '../FocusedClassEntries';
import type { SecretaryCockpitClassEntry } from '../cockpitClassEntries';
import type { SecretaryCockpitRunOrderControls } from '../secretaryCockpitTypes';
import { queueFor } from './queueFixture';

// The real DndContext and sensors: only layout (getBoundingClientRect) is faked, since jsdom has none.
function entry(id: string, armband: string, dogName: string): SecretaryCockpitClassEntry {
  return {
    nodeId: `entry:${id}`,
    queue: queueFor(`entry:${id}`, armband, 'waiting'),
    entryId: id,
    armband,
    dogName,
    checkInValue: 'no-status',
    deskEditable: true,
    lockedReason: null,
    state: 'waiting',
    counted: true,
    notCheckedIn: true,
    place: 1,
    result: null,
  };
}

const scoredRow: SecretaryCockpitClassEntry = {
  ...entry('e0', '100', 'Done'),
  state: 'scored',
  place: null,
  queue: queueFor('entry:e0', '100', 'scored'),
};

const placement = vi.hoisted(() => ({
  waitingIds: ['e1', 'e2', 'e3'] as string[] | null,
  isError: false,
  retry: vi.fn(),
}));
vi.mock('../useRunOrderPlacement', () => ({ useRunOrderPlacement: () => placement }));

const rows = [
  scoredRow,
  entry('e1', '101', 'Moss'),
  entry('e2', '102', 'Piper'),
  entry('e3', '103', 'Juno'),
];

function setup() {
  const runOrder: SecretaryCockpitRunOrderControls = {
    onAutoSort: vi.fn(),
    isAutoSorting: false,
    onPlaceEntry: vi.fn(),
    lastChange: null,
    onUndo: vi.fn(),
  };
  render(
    <StrictMode>
      <ClassEntriesTable
        entries={rows}
        className="A"
        reorder={{ showId: 'show-1', classId: 'class-1', runOrder }}
      />
    </StrictMode>
  );
  return runOrder;
}

const gripOf = (label: string) =>
  screen.getByRole('button', { name: `Drag ${label} to change run order` });

describe('real dnd-kit wiring for the run-order grips (MYK9-1872)', () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement
    ) {
      const index = this.closest('tr')
        ? Array.from(this.closest('tbody')?.children ?? []).indexOf(this.closest('tr')!)
        : -1;
      const top = Math.max(index, 0) * 50;
      return {
        x: 0,
        y: top,
        top,
        left: 0,
        right: 400,
        bottom: top + 50,
        width: 400,
        height: 50,
        toJSON: () => ({}),
      };
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ['Space', ' '],
    ['Enter', '{Enter}'],
  ])(
    'keyboard: pick up, ArrowUp from the last row, drop with %s places the dog',
    async (_n, dropKey) => {
      const runOrder = setup();
      const user = userEvent.setup();
      gripOf('#103 Juno').focus();
      await user.keyboard(' ');
      await user.keyboard('{ArrowUp}');
      await user.keyboard(dropKey);
      expect(runOrder.onPlaceEntry).toHaveBeenCalledWith(
        expect.objectContaining({ classId: 'class-1', entryId: 'e3', overEntryId: 'e2' })
      );
    }
  );

  it('announces dog names and slots to a screen reader, not ids', async () => {
    setup();
    const user = userEvent.setup();
    gripOf('#103 Juno').focus();
    await user.keyboard(' ');
    expect(await screen.findByText('#103 Juno at position 3 of 3')).toBeInTheDocument();
    await user.keyboard('{ArrowUp}');
    expect(await screen.findByText('#103 Juno moved to position 2 of 3')).toBeInTheDocument();
    await user.keyboard(' ');
    expect(
      await screen.findByText('#103 Juno dropped at position 2. Saving run order.')
    ).toBeInTheDocument();
  });

  it('mouse: pointer drag of 8px or more over another row places the dog', () => {
    const runOrder = setup();
    const grip = gripOf('#101 Moss');
    fireEvent.pointerDown(grip, { button: 0, isPrimary: true, clientX: 10, clientY: 25 });
    fireEvent.pointerMove(document, { clientX: 10, clientY: 60, isPrimary: true });
    fireEvent.pointerMove(document, { clientX: 10, clientY: 110, isPrimary: true });
    fireEvent.pointerUp(document, { clientX: 10, clientY: 110, isPrimary: true });
    expect(runOrder.onPlaceEntry).toHaveBeenCalledWith(
      expect.objectContaining({ entryId: 'e1', overEntryId: 'e3' })
    );
  });
});
