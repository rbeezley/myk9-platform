/**
 * F29b phase 2a — run order had no reachable control anywhere.
 *
 * The dead end was three hops: `SecretaryRunSheet` renders entries in run order and
 * links out for reorder to `/shows/:showId/show-day`; Show Desk's focused-class panel
 * offered "Run order and class setup", which pointed at Manage Classes; and Manage Classes has no run-order control. `ShowMapRunOrderMenu`
 * itself renders only inside `ShowMapStructureTable` → `ShowMapTab`, the public map,
 * read-only by intent (#291).
 *
 * These assert the control is reachable from the focused-class panel and actually
 * fires the auto-sort mutation — not merely that a menu renders.
 *
 * Manual drag reorder (phase 2b) is deliberately NOT here; see
 * docs/plan-f29b-operational-actions-home.md.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';

vi.mock('@/services/replication', () => ({
  replicatedPaperworkPrintsTable: {
    confirmPrinted: vi.fn(async () => ({ id: 'print-1' })),
    voidPrint: vi.fn(async () => undefined),
  },
}));
vi.mock('@/lib/undoToast', () => ({ showUndoToast: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { SecretaryCockpitFocusedClass } from './SecretaryCockpitFocusedClass';
import type {
  FocusedClassModel,
  SecretaryCockpitClass,
  SecretaryCockpitTrial,
} from './secretaryCockpitTypes';

const TRIAL: SecretaryCockpitTrial = {
  id: 'trial-1',
  date: '2026-07-20',
  number: '1',
  order: 0,
};

/** Two entries minimum: ShowMapRunOrderMenu hides itself below 2 (sorting one is a no-op). */
const ENTRY_ROWS = [
  { nodeId: 'entry:e1', label: '#101 Ranger', actions: [] },
  { nodeId: 'entry:e2', label: '#102 Juni', actions: [] },
];

const FOCUSED: FocusedClassModel = {
  id: 'class-1',
  trialId: 'trial-1',
  name: 'Container Novice A',
  timeLabel: '9:00 AM',
  scheduledStart: '9:00 AM',
  expectedStart: '9:00 AM',
  startedLabel: null,
  lifecycle: { evidence: 'recorded', value: 'not-started' },
  progress: { evidence: 'computed', value: { completed: 0, total: 2 } },
  judgeName: null,
  attentionCount: 0,
  closeout: 'none',
  primaryAction: null,
  statusLine: { text: 'Not started', parts: ['Not started'] },
  printTrackingInUse: true,
  checklistInUse: true,
  actualStart: { evidence: 'unknown', value: null },
  actualFinish: { evidence: 'unknown', value: null },
  paperwork: [],
  primaryActions: [],
  prepareActions: [],
  finishActions: [],
  classWorkActions: [],
  entryRows: ENTRY_ROWS,
  entries: [],
  entriesHidden: 0,
};

const SOURCE_CLASS = {
  id: 'class-1',
  trialId: 'trial-1',
  name: 'Container Novice A',
  classOrder: 0,
  lifecycle: 'not-started',
  entryCount: 2,
  scoredCount: 0,
  attention: [],
  actions: [],
  paperwork: [],
  entryRows: ENTRY_ROWS,
} as unknown as SecretaryCockpitClass;

const controls = (onAutoSort: () => void) => ({
  onAutoSort,
  isAutoSorting: false,
  onPlaceEntry: vi.fn(),
  lastChange: null,
  onUndo: vi.fn(),
});

function renderPanel(overrides: Record<string, unknown> = {}) {
  const onAutoSort = vi.fn();
  render(
    <SecretaryCockpitFocusedClass
      showId="show-1"
      focused={FOCUSED}
      sourceClass={SOURCE_CLASS}
      trial={TRIAL}
      attention={[]}
      timeZone="America/Chicago"
      canManageShow
      onCommand={vi.fn()}
      runOrder={controls(onAutoSort)}
      {...overrides}
    />
  );
  return { onAutoSort };
}

const actionsButton = () => screen.getByRole('button', { name: /^Actions for/ });

async function openRunOrderPresets(user: ReturnType<typeof userEvent.setup>) {
  await user.click(actionsButton());
  await user.click(await screen.findByRole('menuitem', { name: 'Auto-sort run order' }));
}

describe('run order is reachable from the Actions menu (MYK9-1796)', () => {
  it('offers auto-sort and place by hand beside the other class actions', async () => {
    renderPanel();
    const user = userEvent.setup();
    await user.click(actionsButton());
    expect(
      await screen.findByRole('menuitem', { name: 'Auto-sort run order' })
    ).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Place by hand' })).toBeInTheDocument();
  });

  it('fires the auto-sort mutation with the focused class', async () => {
    const { onAutoSort } = renderPanel();
    // A submenu parks pointer-events: none on its parent while open, which user-event would refuse.
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    await openRunOrderPresets(user);
    await user.click(await screen.findByRole('menuitem', { name: /Armband ↑/ }));

    // A menu that renders but fires nothing would still pass a render-only assertion.
    expect(onAutoSort).toHaveBeenCalledWith(
      expect.objectContaining({ classId: 'class-1', kind: 'armband-asc' })
    );
  });

  it('Place by hand opens the hand-placement list for the focused class', async () => {
    renderPanel();
    const user = userEvent.setup();
    await user.click(actionsButton());
    await user.click(await screen.findByRole('menuitem', { name: 'Place by hand' }));
    // The hand-placement list is the only thing on the panel with a Done button.
    expect(await screen.findByRole('button', { name: 'Done' })).toBeInTheDocument();
  });

  it.each([0, 1])('omits the run-order items for a class with %i entries', async count => {
    renderPanel({
      sourceClass: { ...SOURCE_CLASS, entryCount: count },
      focused: { ...FOCUSED, entryRows: [] },
    });
    const user = userEvent.setup();
    await user.click(actionsButton());
    // Positive control: the menu opened and holds its other items.
    expect(await screen.findByRole('menuitem', { name: 'Set expected start' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Auto-sort run order' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Place by hand' })).toBeNull();
  });

  it('is absent for a non-manager, like the entry actions beside it', () => {
    renderPanel({ canManageShow: false });
    expect(screen.queryByRole('button', { name: /^Actions for/ })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Auto-sort run order' })).toBeNull();
  });

  it('is absent when no run-order controls are supplied', async () => {
    renderPanel({ runOrder: undefined });
    const user = userEvent.setup();
    await user.click(actionsButton());
    expect(await screen.findByRole('menuitem', { name: 'Set expected start' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Auto-sort run order' })).toBeNull();
  });

  it('is offered for a class with entries but NO stranded actions', async () => {
    // The menu used to live inside the Entries section, which is gated on `entryRows` --
    // filtered by STRANDED_ENTRY_ACTION_IDS. Auto-sort availability is unrelated to them.
    render(
      <SecretaryCockpitFocusedClass
        showId="show-1"
        focused={{ ...FOCUSED, entryRows: [] }}
        sourceClass={{ ...SOURCE_CLASS, entryCount: 8 }}
        trial={TRIAL}
        attention={[]}
        timeZone="America/Chicago"
        canManageShow
        onCommand={vi.fn()}
        runOrder={controls(vi.fn())}
      />
    );
    const user = userEvent.setup();
    await user.click(actionsButton());

    expect(
      await screen.findByRole('menuitem', { name: 'Auto-sort run order' })
    ).toBeInTheDocument();
    // ...and the entry-action list is correctly absent, since there are none.
    expect(screen.queryAllByRole('button', { name: /^Change class/i })).toHaveLength(0);
  });

  it('counts pending dogs on the run list, not only the dogs left to score', async () => {
    // One accepted dog and two pending: the scoring count is 1, but the run list
    // still sorts three rows, so the items must stay.
    renderPanel({ sourceClass: { ...SOURCE_CLASS, entryCount: 1, runListCount: 3 } });
    const user = userEvent.setup();
    await user.click(actionsButton());
    expect(
      await screen.findByRole('menuitem', { name: 'Auto-sort run order' })
    ).toBeInTheDocument();
  });

  it('omits the items when the run list itself has fewer than two rows', async () => {
    renderPanel({ sourceClass: { ...SOURCE_CLASS, entryCount: 1, runListCount: 1 } });
    const user = userEvent.setup();
    await user.click(actionsButton());
    expect(await screen.findByRole('menuitem', { name: 'Set expected start' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Auto-sort run order' })).toBeNull();
  });
});
