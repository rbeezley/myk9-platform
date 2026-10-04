import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import type { SecretaryEntry } from '@/services/database/entries';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const entries = vi.hoisted(() => ({ rows: [] as unknown[] }));
vi.mock('@/hooks/queries/useEntriesDatabase', () => ({
  useSecretaryShowEntriesQuery: () => ({ data: entries.rows, isLoading: false }),
}));

import { RunOrderHandPlacement, RunOrderUndoNotice } from './RunOrderHandPlacement';
import type { SecretaryCockpitRunOrderControls } from './secretaryCockpitTypes';

const row = (id: string, runOrder: number, extra: Record<string, unknown> = {}) =>
  ({
    id,
    class_id: 'c1',
    run_order: runOrder,
    armband: String(100 + Number(id.slice(1))),
    entry_status: 'confirmed',
    handler: `Handler ${id}`,
    dog: { id: `d${id}`, name: `Dog ${id}`, call_name: `Pup${id.slice(1)}` },
    ...extra,
  }) as unknown as SecretaryEntry;

function setup(overrides: Partial<SecretaryCockpitRunOrderControls> = {}) {
  entries.rows = [
    row('e1', 1),
    row('e2', 2, { is_scored: true }),
    row('e3', 3),
    row('e4', 4, { is_in_ring: true }),
    row('e5', 5),
  ];
  const runOrder: SecretaryCockpitRunOrderControls = {
    onAutoSort: vi.fn(),
    isAutoSorting: false,
    onPlaceEntry: vi.fn(),
    lastChange: null,
    onUndo: vi.fn(),
    ...overrides,
  };
  const onDone = vi.fn();
  render(<RunOrderHandPlacement showId="s1" classId="c1" runOrder={runOrder} onDone={onDone} />);
  return { runOrder, onDone };
}

describe('RunOrderHandPlacement', () => {
  it('Move down steps to the next open slot, skipping a pinned dog', async () => {
    const { runOrder } = setup();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Move #103 Pup3 down' }));
    expect(runOrder.onPlaceEntry).toHaveBeenCalledWith({
      classId: 'c1',
      entryId: 'e3',
      toPosition: 5,
      entryLabel: '#103 Pup3',
    });
  });

  it('Move to position picks an open slot from a labelled select', async () => {
    const { runOrder } = setup();
    await userEvent
      .setup()
      .selectOptions(screen.getByLabelText('Move #105 Pup5 to position'), 'Position 1');
    expect(runOrder.onPlaceEntry).toHaveBeenCalledWith(
      expect.objectContaining({ entryId: 'e5', toPosition: 1 })
    );
  });

  it('pinned dogs have no move controls and say why', () => {
    setup();
    expect(screen.queryByRole('button', { name: /Move #102/ })).toBeNull();
    expect(screen.queryByLabelText(/Move #104/)).toBeNull();
    expect(screen.getByText('Has run. Keeps its place.')).toBeInTheDocument();
    expect(screen.getByText('In the ring. Keeps its place.')).toBeInTheDocument();
  });

  it('disables Up at the first open slot and Down at the last', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Move #101 Pup1 up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move #105 Pup5 down' })).toBeDisabled();
  });

  it('keeps tablet targets at the 44px floor', () => {
    setup();
    const item = screen.getByRole('button', { name: 'Move #101 Pup1 down' });
    expect(item.className).toMatch(/min-h-11|h-11/);
    expect(screen.getByLabelText('Move #101 Pup1 to position').className).toMatch(/h-11/);
    expect(
      within(screen.getByRole('list', { name: 'Run order' })).getAllByRole('listitem')
    ).toHaveLength(5);
  });

  it('says a preset replaces hand placements', () => {
    setup();
    expect(screen.getByText(/replace anything placed here/)).toBeInTheDocument();
  });
});

describe('RunOrderUndoNotice', () => {
  const base = {
    onAutoSort: vi.fn(),
    isAutoSorting: false,
    onPlaceEntry: vi.fn(),
    onUndo: vi.fn(),
  };

  it('offers Undo for a change in this class only', async () => {
    const onUndo = vi.fn();
    render(
      <RunOrderUndoNotice
        classId="c1"
        runOrder={{
          ...base,
          onUndo,
          lastChange: { classId: 'c1', summary: 'Moved #104 to position 1' },
        }}
      />
    );
    await userEvent.setup().click(screen.getByRole('button', { name: /Undo/ }));
    expect(onUndo).toHaveBeenCalled();
  });

  it('is absent for another class', () => {
    render(
      <RunOrderUndoNotice
        classId="c2"
        runOrder={{ ...base, lastChange: { classId: 'c1', summary: 'x' } }}
      />
    );
    expect(screen.queryByRole('button', { name: /Undo/ })).toBeNull();
  });
});
