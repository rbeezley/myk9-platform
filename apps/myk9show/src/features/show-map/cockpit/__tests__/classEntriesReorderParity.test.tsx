import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { render } from '@/test/utils/testUtils';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';
import { buildShowMapTree } from '../../showMapTree';
import { buildClassPlacement } from '../../showMapHandPlacement';
import { ClassEntriesTable } from '../FocusedClassEntries';
import { classEntriesForClass } from '../cockpitClassEntries';
import type { SecretaryCockpitRunOrderControls } from '../secretaryCockpitTypes';

const dnd = vi.hoisted(() => ({
  onDragEnd: undefined as undefined | ((event: unknown) => void),
}));
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

const replica = vi.hoisted(() => ({ rows: [] as unknown[] }));
vi.mock('../../classPlacementSource', async importOriginal => {
  const { buildClassPlacement: build } = await import('../../showMapHandPlacement');
  return {
    ...(await importOriginal<typeof import('../../classPlacementSource')>()),
    loadClassPlacement: async () => build(replica.rows as never, []),
  };
});

const show = { id: 'show-1', name: 'Show', organization: 'AKC' } as never;
const trial = { id: 'trial-1', trialDate: '2026-07-20', trialNumber: '1' } as never;
const cls = { id: 'class-1', trialId: 'trial-1', element: 'Container', level: 'Novice' } as never;

/** One dog as the Show Desk tree reads it (snake_case) and as the replica holds it. */
function dog(id: string, armband: string, runOrder: number, fields: Record<string, unknown> = {}) {
  return {
    id,
    class_id: 'class-1',
    entry_status: 'confirmed',
    armband,
    run_order: runOrder,
    dog: { call_name: `Dog${armband}` },
    dogCallName: `Dog${armband}`,
    runOrder,
    entryStatus: 'confirmed',
    ...fields,
  };
}

// e2 has a stale ring_entry_time but is_in_ring false, so it is waiting (MYK9-1889);
// e4 is check-in completed but not is_scored, so it is not. The table and the placement
// model (what the write renumbers) agree on both.
const FIXTURE = [
  dog('e1', '101', 1),
  dog('e2', '102', 2, { ring_entry_time: '2026-07-20T10:00:00Z' }),
  dog('e3', '103', 3),
  dog('e4', '104', 4, { check_in_status: 'completed', checkInStatus: 'completed' }),
  dog('e5', '105', 5),
];

function controls() {
  return {
    onAutoSort: vi.fn(),
    isAutoSorting: false,
    onPlaceEntry: vi.fn(),
    lastChange: null,
    onUndo: vi.fn(),
  } satisfies SecretaryCockpitRunOrderControls;
}

function renderFixture(runOrder: SecretaryCockpitRunOrderControls) {
  const tree = buildShowMapTree({
    show,
    trials: [trial],
    classes: [cls],
    entries: FIXTURE,
    entryPreviewLimit: Number.POSITIVE_INFINITY,
  });
  render(
    <ClassEntriesTable
      entries={classEntriesForClass('class-1', tree)}
      className="A"
      reorder={{ showId: 'show-1', classId: 'class-1', runOrder }}
    />
  );
}

describe('grips and the write use the same waiting list (MYK9-1872)', () => {
  beforeEach(() => {
    replica.rows = FIXTURE;
    dnd.onDragEnd = undefined;
  });

  it('gives grips to exactly model.waiting, and a drop names a dog the write will find', async () => {
    const model = buildClassPlacement(FIXTURE as unknown as ReplicatedEntry[], []).model;
    const waiting = model.waiting.map(row => row.id);
    // Guard the fixture: the model really does disagree with the table's own states.
    expect(waiting).toEqual(['e1', 'e2', 'e3', 'e5']);

    const runOrder = controls();
    renderFixture(runOrder);
    await waitFor(() => expect(screen.getAllByTestId('run-order-grip')).toHaveLength(4));
    for (const armband of ['101', '102', '103', '105']) {
      expect(screen.getByRole('button', { name: new RegExp(`Drag #${armband} `) })).toBeEnabled();
    }
    for (const armband of ['104']) {
      expect(screen.queryByRole('button', { name: new RegExp(`Drag #${armband} `) })).toBeNull();
    }

    dnd.onDragEnd?.({ active: { id: 'entry:e5' }, over: { id: 'entry:e1' } });
    expect(runOrder.onPlaceEntry).toHaveBeenCalledWith(
      expect.objectContaining({ entryId: 'e5', overEntryId: 'e1' })
    );
    // The slot the write resolves for that drop in the model's own numbering.
    expect(waiting.indexOf('e1') + 1).toBe(1);
  });
});
