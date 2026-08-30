/**
 * F29b phase 2a — run order had no reachable control anywhere.
 *
 * The dead end was three hops: `SecretaryRunSheet` renders entries in run order and
 * links out for reorder to `/shows/:showId/show-desk`; Show Desk's focused-class panel
 * offers "Run order and class setup", which points at `getCockpitClassManagementHref`
 * → Manage Classes; and Manage Classes has no run-order control. `ShowMapRunOrderMenu`
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
  lifecycle: { evidence: 'recorded', value: 'not-started' },
  progress: { evidence: 'computed', value: { completed: 0, total: 2 } },
  operationalArea: { evidence: 'unknown', value: null },
  judgeName: null,
  attentionCount: 0,
  closeout: 'none',
  primaryAction: null,
  actualStart: { evidence: 'unknown', value: null },
  actualFinish: { evidence: 'unknown', value: null },
  paperwork: [],
  primaryActions: [],
  prepareActions: [],
  finishActions: [],
  classWorkActions: [],
  entryRows: ENTRY_ROWS,
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

function renderPanel(overrides: Record<string, unknown> = {}) {
  const onAutoSort = vi.fn();
  render(
    <SecretaryCockpitFocusedClass
      focused={FOCUSED}
      sourceClass={SOURCE_CLASS}
      trial={TRIAL}
      attention={[]}
      timeZone="America/Chicago"
      canManageShow
      onCommand={vi.fn()}
      runOrder={{ onAutoSort, isAutoSorting: false }}
      {...overrides}
    />
  );
  return { onAutoSort };
}

describe('run order is reachable from the focused-class panel', () => {
  it('offers the run-order menu beside the entries', async () => {
    renderPanel();
    expect(screen.getByRole('button', { name: /run order/i })).toBeInTheDocument();
  });

  it('fires the auto-sort mutation with the focused class', async () => {
    const { onAutoSort } = renderPanel();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /run order/i }));
    await user.click(await screen.findByRole('menuitem', { name: /Armband ↑/ }));

    // A menu that renders but fires nothing would still pass a render-only assertion.
    expect(onAutoSort).toHaveBeenCalledWith(
      expect.objectContaining({ classId: 'class-1', kind: 'armband-asc' })
    );
  });

  it('is absent for a non-manager, like the entry actions beside it', () => {
    renderPanel({ canManageShow: false });
    expect(screen.queryByRole('button', { name: /run order/i })).toBeNull();
  });

  it('is absent when no run-order controls are supplied', () => {
    renderPanel({ runOrder: undefined });
    expect(screen.queryByRole('button', { name: /run order/i })).toBeNull();
  });

  it('renders for a class with entries but NO stranded actions', () => {
    // The regression this guards: the menu used to live inside the Entries section,
    // which is gated on `entryRows` -- filtered by STRANDED_ENTRY_ACTION_IDS. A class
    // with entries to sort but no move-up actions would have had entries and no menu
    // to sort them with. Auto-sort availability is unrelated to stranded actions.
    const onAutoSort = vi.fn();
    render(
      <SecretaryCockpitFocusedClass
        focused={{ ...FOCUSED, entryRows: [] }}
        sourceClass={{ ...SOURCE_CLASS, entryCount: 8 }}
        trial={TRIAL}
        attention={[]}
        timeZone="America/Chicago"
        canManageShow
        onCommand={vi.fn()}
        runOrder={{ onAutoSort, isAutoSorting: false }}
      />
    );

    expect(screen.getByRole('button', { name: /run order/i })).toBeInTheDocument();
    // ...and the entry-action list is correctly absent, since there are none.
    expect(screen.queryAllByRole('button', { name: /Move up/i })).toHaveLength(0);
  });
});
