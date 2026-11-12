import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { render } from '@/test/utils/testUtils';
import { ClassEntriesTable } from '../FocusedClassEntries';
import type { SecretaryCockpitClassEntry } from '../cockpitClassEntries';
import type { SecretaryCockpitRunOrderControls } from '../secretaryCockpitTypes';
import { queueFor } from './queueFixture';

const placement = vi.hoisted(() => ({
  waitingIds: ['e1', 'e3', 'e5'] as string[] | null,
  isError: false,
  retry: vi.fn(),
}));
vi.mock('../useRunOrderPlacement', () => ({ useRunOrderPlacement: () => placement }));

const dnd = vi.hoisted(() => ({
  onDragEnd: undefined as undefined | ((event: unknown) => void),
}));
// jsdom has no layout, so dnd-kit's own pointer/keyboard geometry cannot run; capture the drop
// handler the table hands to DndContext and fire it with the event dnd-kit would send.
vi.mock('@dnd-kit/core', async importOriginal => {
  const actual = await importOriginal<typeof import('@dnd-kit/core')>();
  return {
    ...actual,
    DndContext: ({
      children,
      onDragEnd,
    }: {
      children: React.ReactNode;
      onDragEnd: (event: unknown) => void;
    }) => {
      dnd.onDragEnd = onDragEnd;
      return <>{children}</>;
    },
  };
});

function entry(
  id: string,
  armband: string,
  dogName: string,
  overrides: Partial<SecretaryCockpitClassEntry> = {}
): SecretaryCockpitClassEntry {
  const state = overrides.state ?? 'waiting';
  return {
    nodeId: `entry:${id}`,
    queue: queueFor(`entry:${id}`, armband, state),
    entryId: id,
    armband,
    dogName,
    checkInValue: 'no-status',
    deskEditable: true,
    lockedReason: null,
    state,
    counted: true,
    notCheckedIn: state === 'waiting',
    place: state === 'waiting' ? 1 : null,
    result: null,
    ...overrides,
  };
}

const rows = [
  entry('e1', '101', 'Moss'),
  entry('e2', '102', 'Piper', { state: 'scored' }),
  entry('e3', '103', 'Juno'),
  entry('e4', '104', 'Rex', { state: 'in-ring' }),
  entry('e5', '105', 'Tilly'),
];

function controls(overrides: Partial<SecretaryCockpitRunOrderControls> = {}) {
  return {
    onAutoSort: vi.fn(),
    isAutoSorting: false,
    onPlaceEntry: vi.fn(),
    lastChange: null,
    onUndo: vi.fn(),
    ...overrides,
  } satisfies SecretaryCockpitRunOrderControls;
}

function renderTable(runOrder?: SecretaryCockpitRunOrderControls, entries = rows) {
  return render(
    <ClassEntriesTable
      entries={entries}
      className="Container Novice A"
      reorder={runOrder ? { showId: 'show-1', classId: 'class-1', runOrder } : undefined}
    />
  );
}

const drop = (active: string, over: string | null) =>
  dnd.onDragEnd?.({
    active: { id: `entry:${active}` },
    over: over ? { id: `entry:${over}` } : null,
  });

describe('drag a waiting dog to change the run order (MYK9-1872)', () => {
  beforeEach(() => {
    placement.waitingIds = ['e1', 'e3', 'e5'];
    placement.isError = false;
    dnd.onDragEnd = undefined;
  });

  it('puts a named grip on each waiting dog and none on the others', () => {
    renderTable(controls());
    expect(screen.getAllByTestId('run-order-grip')).toHaveLength(3);
    for (const name of ['#101 Moss', '#103 Juno', '#105 Tilly']) {
      expect(
        screen.getByRole('button', { name: `Drag ${name} to change run order` })
      ).toBeEnabled();
    }
    for (const dog of ['Piper', 'Rex']) {
      const row = screen.getByText(dog).closest('tr');
      expect(row && within(row).queryByTestId('run-order-grip')).toBeNull();
    }
  });

  it.each([
    ['down', 'e1', 'e3'],
    ['to the bottom', 'e1', 'e5'],
    ['up', 'e5', 'e3'],
    ['to the top', 'e5', 'e1'],
  ])('dropping a dog %s names the dog it was dropped on', (_n, active, over) => {
    const runOrder = controls();
    renderTable(runOrder);
    drop(active, over);
    expect(runOrder.onPlaceEntry).toHaveBeenCalledWith({
      classId: 'class-1',
      entryId: active,
      overEntryId: over,
      entryLabel: expect.stringMatching(/^#10\d /),
    });
  });

  it('ignores a drop on a dog that cannot move, on itself, or outside the list', () => {
    const runOrder = controls();
    renderTable(runOrder);
    drop('e1', 'e2');
    drop('e1', 'e4');
    drop('e1', 'e1');
    drop('e1', null);
    expect(runOrder.onPlaceEntry).not.toHaveBeenCalled();
  });

  it('shows no grips for a non-manager (no run-order controls)', () => {
    renderTable(undefined);
    expect(screen.queryByTestId('run-order-grip')).toBeNull();
  });

  it('shows no grips when fewer than two dogs are waiting', () => {
    renderTable(controls(), rows.slice(0, 2));
    expect(screen.queryByTestId('run-order-grip')).toBeNull();
  });

  it('disables the grips and drops while an auto-sort or write is running', () => {
    const runOrder = controls({ isAutoSorting: true });
    renderTable(runOrder);
    for (const grip of screen.getAllByTestId('run-order-grip')) expect(grip).toBeDisabled();
    drop('e1', 'e3');
    expect(runOrder.onPlaceEntry).not.toHaveBeenCalled();
  });

  it('offers no grips while the placement read is loading, and a retry when it failed', () => {
    placement.waitingIds = null;
    renderTable(controls());
    expect(screen.queryByTestId('run-order-grip')).toBeNull();
    expect(screen.getByTestId('class-entries-table')).toBeInTheDocument();
  });

  it('shows the read error with Try again and no grips', async () => {
    placement.waitingIds = null;
    placement.isError = true;
    const { user } = renderTable(controls());
    expect(screen.getByText(/Couldn.t load the run order/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(placement.retry).toHaveBeenCalled();
  });

  it('grips follow the placement model, not the table state', () => {
    // The model says Moss and Rex wait; the table calls Rex in-ring and Juno waiting.
    placement.waitingIds = ['e4', 'e1'];
    renderTable(controls());
    expect(screen.getAllByTestId('run-order-grip')).toHaveLength(2);
    expect(screen.getByRole('button', { name: /Drag #104 Rex/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Drag #103 Juno/ })).toBeNull();
  });
});
