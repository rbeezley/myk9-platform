import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { render } from '@/test/utils/testUtils';
import { ClassEntriesTable } from '../FocusedClassEntries';
import type { SecretaryCockpitClassEntry } from '../cockpitClassEntries';
import type { SecretaryCockpitRunOrderControls } from '../secretaryCockpitTypes';
import { queueFor } from './queueFixture';

/*
 * MYK9-1902: on Show Desk the entries table sits in a sticky, scrollable class panel inside a
 * scrollable page column. Once the panel is scrolled to its bottom, dnd-kit's keyboard sensor
 * tried to "move" the dog by scrolling the column instead, which cannot move rows inside a
 * sticky panel, so an ArrowDown press was lost. Real DndContext and sensors; only layout is faked.
 */
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

const placement = vi.hoisted(() => ({
  waitingIds: ['e1', 'e2', 'e3'] as string[] | null,
  isError: false,
  retry: vi.fn(),
}));
vi.mock('../useRunOrderPlacement', () => ({ useRunOrderPlacement: () => placement }));

const rows = [entry('e1', '101', 'Moss'), entry('e2', '102', 'Piper'), entry('e3', '103', 'Juno')];

const ROW = 50;
// The column shows 0-120 (middle 60) and can scroll a long way; the panel shows 0-200 and is
// already at its bottom. Rows sit at 0, 50, 100: every move down lands below the column's middle.
const RECTS: Record<string, { top: number; height: number }> = {
  column: { top: 0, height: 120 },
  panel: { top: 0, height: 200 },
};

function rect(top: number, height: number): DOMRect {
  return {
    x: 0,
    y: top,
    top,
    left: 0,
    right: 400,
    bottom: top + height,
    width: 400,
    height,
    toJSON: () => ({}),
  } as DOMRect;
}

function scrollBox(el: HTMLElement, scrollTop: number, scrollHeight: number, clientHeight: number) {
  Object.defineProperty(el, 'scrollTop', { configurable: true, writable: true, value: scrollTop });
  Object.defineProperty(el, 'scrollHeight', { configurable: true, value: scrollHeight });
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: clientHeight });
  Object.defineProperty(el, 'scrollWidth', { configurable: true, value: 400 });
  Object.defineProperty(el, 'clientWidth', { configurable: true, value: 400 });
  el.scrollTo = vi.fn();
  el.scrollBy = vi.fn();
}

function setup() {
  const runOrder: SecretaryCockpitRunOrderControls = {
    onAutoSort: vi.fn(),
    isAutoSorting: false,
    onPlaceEntry: vi.fn(),
    lastChange: null,
    onUndo: vi.fn(),
  };
  render(
    <div data-testid="column" style={{ overflowY: 'auto' }}>
      <div data-testid="panel" style={{ position: 'sticky', overflowY: 'auto' }}>
        <ClassEntriesTable
          entries={rows}
          className="A"
          reorder={{ showId: 'show-1', classId: 'class-1', runOrder }}
        />
      </div>
    </div>
  );
  const column = screen.getByTestId('column');
  const panel = screen.getByTestId('panel');
  scrollBox(column, 0, 1000, 120);
  scrollBox(panel, 100, 300, 200);
  return { runOrder, column };
}

const gripOf = (label: string) =>
  screen.getByRole('button', { name: `Drag ${label} to change run order` });

describe('keyboard run-order moves inside a sticky scrolling panel (MYK9-1902)', () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement
    ) {
      const box = RECTS[this.dataset.testid ?? ''];
      if (box) return rect(box.top, box.height);
      const row = this.closest('tr');
      const index = row ? Array.from(row.closest('tbody')?.children ?? []).indexOf(row) : -1;
      return rect(Math.max(index, 0) * ROW, ROW);
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('two ArrowDown presses move the dog two places, and never scroll the column', async () => {
    const { runOrder, column } = setup();
    const user = userEvent.setup();
    gripOf('#101 Moss').focus();
    await user.keyboard(' ');
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{ArrowDown}');
    await user.keyboard(' ');

    expect(runOrder.onPlaceEntry).toHaveBeenCalledWith(
      expect.objectContaining({ classId: 'class-1', entryId: 'e1', overEntryId: 'e3' })
    );
    expect(column.scrollTo).not.toHaveBeenCalled();
    expect(column.scrollBy).not.toHaveBeenCalled();
  });
});
