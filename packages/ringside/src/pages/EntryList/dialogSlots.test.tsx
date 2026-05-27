/**
 * Tests for `EntryListDialogSlots` — the dialog DI surface shipped in
 * PR E2c.
 *
 * No real dialogs move in this PR; the design ships ahead of the page
 * move (E2d) so the interface can be reviewed in isolation. These
 * tests exercise the slot contract end-to-end using stub components:
 *
 *  1. A host can build a complete `EntryListDialogSlots` bag with
 *     trivial stubs and TypeScript accepts it (compile-time check —
 *     if a future prop change breaks the contract, the build fails
 *     before tests run).
 *
 *  2. A consumer rendering each slot by name passes its declared
 *     props through to the underlying component and the component
 *     receives them with the right shapes.
 *
 *  3. The `AreaCountSelectionDialog` slot is genuinely optional — a
 *     bag missing that key still typechecks AND a consumer
 *     conditionally rendering it doesn't blow up at runtime when
 *     undefined.
 *
 *  4. Callback signatures match what the host's real dialogs expect:
 *     `onApplyOrder` returns a Promise (so the dialog can await it),
 *     `onStatistics` allows returning `boolean | void`, etc.
 *
 * When PR E2d wires the ringside page in, it will consume this slot
 * bag directly. These tests are the contract spec until then.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type {
  EntryListDialogSlots,
  RunOrderPreset,
  RunOrderScope,
  RenumberMode,
  PrintSortOrder,
  CheckInStatus,
} from './dialogSlots';
import type { Entry } from '../../stores/entryStore';

// ----- Stub dialog components ------------------------------------------------
//
// Each stub renders just enough markup to assert "the slot was called with
// these props." Real implementations live in apps/myk9q's
// src/components/dialogs/ and will be wired in PR E2d.

const StubCheckinStatusDialog: EntryListDialogSlots['CheckinStatusDialog'] = ({
  isOpen,
  onStatusChange,
  dogInfo,
}) => {
  if (!isOpen) return null;
  return (
    <div data-testid="checkin-stub">
      <span>{dogInfo.armband}</span>
      <button onClick={() => onStatusChange('checked-in')}>check in</button>
    </div>
  );
};

const StubClassOptionsDialog: EntryListDialogSlots['ClassOptionsDialog'] = ({
  isOpen,
  classData,
  onStatistics,
}) => {
  if (!isOpen) return null;
  return (
    <div data-testid="options-stub">
      <span>{classData?.class_name ?? '(no class)'}</span>
      <button onClick={() => onStatistics?.()}>stats</button>
    </div>
  );
};

const StubClassStatusDialog: EntryListDialogSlots['ClassStatusDialog'] = ({
  isOpen,
  classData,
  onStatusChange,
}) => (isOpen ? <div data-testid="status-stub">{classData.class_name}<button onClick={() => onStatusChange('in_progress', '10:30')}>go</button></div> : null);

const StubClassRequirementsDialog: EntryListDialogSlots['ClassRequirementsDialog'] = ({
  isOpen,
  classData,
}) => (isOpen ? <div data-testid="reqs-stub">{classData.element}</div> : null);

const StubClassSettingsDialog: EntryListDialogSlots['ClassSettingsDialog'] = ({
  isOpen,
  classData,
}) => (isOpen ? <div data-testid="settings-stub">{classData.id}</div> : null);

const StubMaxTimeDialog: EntryListDialogSlots['MaxTimeDialog'] = ({
  isOpen,
  classData,
  onTimeUpdate,
}) =>
  isOpen ? (
    <div data-testid="maxtime-stub">
      <span>{classData.time_limit_seconds ?? 0}</span>
      <button onClick={onTimeUpdate}>save</button>
    </div>
  ) : null;

const StubRunOrderDialog: EntryListDialogSlots['RunOrderDialog'] = ({
  isOpen,
  entries,
  onApplyOrder,
  onOpenDragMode,
}) =>
  isOpen ? (
    <div data-testid="runorder-stub">
      <span>{entries.length}</span>
      <button onClick={() => onApplyOrder('combined-asc', 'all', 'preserve')}>apply</button>
      <button onClick={onOpenDragMode}>drag</button>
    </div>
  ) : null;

const StubScoresheetPrintDialog: EntryListDialogSlots['ScoresheetPrintDialog'] = ({
  isOpen,
  onPrint,
  options,
}) =>
  isOpen ? (
    <div data-testid="print-stub">
      <span>{options?.primary.label ?? 'Run Order'}</span>
      <button onClick={() => onPrint('placement')}>print</button>
    </div>
  ) : null;

const StubNoStatsDialog: EntryListDialogSlots['NoStatsDialog'] = ({ isOpen, className }) =>
  isOpen ? <div data-testid="nostats-stub">{className ?? '(no class)'}</div> : null;

const StubAreaCountSelectionDialog: NonNullable<
  EntryListDialogSlots['AreaCountSelectionDialog']
> = ({ isOpen, areaCountRequirements }) =>
  isOpen ? <div data-testid="area-stub">{areaCountRequirements.max}</div> : null;

/** Build a complete bag (all 10 slots filled). */
function makeFullSlots(): Required<EntryListDialogSlots> {
  return {
    CheckinStatusDialog: StubCheckinStatusDialog,
    ClassOptionsDialog: StubClassOptionsDialog,
    ClassStatusDialog: StubClassStatusDialog,
    ClassRequirementsDialog: StubClassRequirementsDialog,
    ClassSettingsDialog: StubClassSettingsDialog,
    MaxTimeDialog: StubMaxTimeDialog,
    RunOrderDialog: StubRunOrderDialog,
    ScoresheetPrintDialog: StubScoresheetPrintDialog,
    NoStatsDialog: StubNoStatsDialog,
    AreaCountSelectionDialog: StubAreaCountSelectionDialog,
  };
}

/** Build a minimal bag (omits the optional AreaCountSelectionDialog slot). */
function makeMinimalSlots(): EntryListDialogSlots {
  return {
    CheckinStatusDialog: StubCheckinStatusDialog,
    ClassOptionsDialog: StubClassOptionsDialog,
    ClassStatusDialog: StubClassStatusDialog,
    ClassRequirementsDialog: StubClassRequirementsDialog,
    ClassSettingsDialog: StubClassSettingsDialog,
    MaxTimeDialog: StubMaxTimeDialog,
    RunOrderDialog: StubRunOrderDialog,
    ScoresheetPrintDialog: StubScoresheetPrintDialog,
    NoStatsDialog: StubNoStatsDialog,
    // AreaCountSelectionDialog intentionally omitted — this MUST typecheck.
  };
}

// ----- Tests -----------------------------------------------------------------

describe('EntryListDialogSlots — slot bag construction', () => {
  it('accepts a complete bag (all 10 slots filled)', () => {
    const slots = makeFullSlots();
    // Smoke-check that every slot is a component (function).
    Object.values(slots).forEach(Slot => expect(typeof Slot).toBe('function'));
  });

  it('accepts a minimal bag omitting AreaCountSelectionDialog (the only optional slot)', () => {
    const slots = makeMinimalSlots();
    expect(slots.AreaCountSelectionDialog).toBeUndefined();
    // Required slots still all present.
    expect(slots.CheckinStatusDialog).toBe(StubCheckinStatusDialog);
    expect(slots.RunOrderDialog).toBe(StubRunOrderDialog);
  });
});

describe('EntryListDialogSlots — required-slot rendering', () => {
  const slots = makeFullSlots();

  it('renders CheckinStatusDialog with dogInfo and fires onStatusChange with the right shape', () => {
    const onStatusChange = vi.fn();
    const { CheckinStatusDialog } = slots;
    render(
      <CheckinStatusDialog
        isOpen
        onClose={() => undefined}
        onStatusChange={onStatusChange}
        dogInfo={{ armband: 42, callName: 'Rex', handler: 'Alice' }}
      />,
    );
    // `getByText` throws if the element is missing — that's the assertion.
    // Avoiding `.toBeInTheDocument()` because @testing-library/jest-dom isn't
    // wired into the ringside vitest setup (verified: no other ringside test
    // uses it). This pattern stays consistent with the rest of the package.
    screen.getByText('42');
    fireEvent.click(screen.getByText('check in'));
    // Status is the canonical CheckInStatus union from @myk9/core.
    expect(onStatusChange).toHaveBeenCalledWith<CheckInStatus[]>('checked-in');
  });

  it('renders ClassOptionsDialog with nullable classData and tolerates `null`', () => {
    const { ClassOptionsDialog } = slots;
    render(
      <ClassOptionsDialog isOpen onClose={() => undefined} classData={null} />,
    );
    screen.getByText('(no class)');
  });

  it('ClassOptionsDialog.onStatistics may return boolean | void (used by the "no scores → NoStats" branch)', () => {
    const { ClassOptionsDialog } = slots;
    const onStatistics = vi.fn(() => false as const);
    render(
      <ClassOptionsDialog
        isOpen
        onClose={() => undefined}
        classData={{ id: 1, element: 'Container', level: 'Novice', class_name: 'NA' }}
        onStatistics={onStatistics}
      />,
    );
    fireEvent.click(screen.getByText('stats'));
    // Returning false is part of the contract — typecheck enforces; runtime
    // just confirms the callback fires and returns the literal.
    expect(onStatistics).toHaveReturnedWith(false);
  });

  it('RunOrderDialog accepts an entries array and async onApplyOrder', async () => {
    const onApplyOrder = vi.fn<[RunOrderPreset, RunOrderScope?, RenumberMode?], Promise<void>>(
      async () => undefined,
    );
    const { RunOrderDialog } = slots;
    const entries: Entry[] = [
      { id: 1, armband: 1, callName: '', breed: '', handler: '', isScored: false, status: 'no-status', classId: 1, className: '' },
    ];
    render(
      <RunOrderDialog
        isOpen
        onClose={() => undefined}
        entries={entries}
        onApplyOrder={onApplyOrder}
        onOpenDragMode={() => undefined}
      />,
    );
    screen.getByText('1');
    fireEvent.click(screen.getByText('apply'));
    expect(onApplyOrder).toHaveBeenCalledWith('combined-asc', 'all', 'preserve');
    // The return is awaitable — host's real impl runs DB calls before resolving.
    await expect(onApplyOrder.mock.results[0].value).resolves.toBeUndefined();
  });

  it('ScoresheetPrintDialog passes PrintSortOrder back through onPrint', () => {
    const onPrint = vi.fn<[PrintSortOrder], void>();
    const { ScoresheetPrintDialog } = slots;
    render(
      <ScoresheetPrintDialog
        isOpen
        onClose={() => undefined}
        onPrint={onPrint}
        options={{
          primary: { label: 'Placement', sortOrder: 'placement' },
          secondary: { label: 'Armband', sortOrder: 'armband' },
        }}
      />,
    );
    fireEvent.click(screen.getByText('print'));
    expect(onPrint).toHaveBeenCalledWith('placement');
  });

  it('MaxTimeDialog renders with optional onTimeUpdate and fires it when present', () => {
    const onTimeUpdate = vi.fn();
    const { MaxTimeDialog } = slots;
    render(
      <MaxTimeDialog
        isOpen
        onClose={() => undefined}
        classData={{
          id: 1,
          element: 'Buried',
          level: 'Open',
          class_name: 'OB',
          time_limit_seconds: 180,
        }}
        onTimeUpdate={onTimeUpdate}
      />,
    );
    screen.getByText('180');
    fireEvent.click(screen.getByText('save'));
    expect(onTimeUpdate).toHaveBeenCalled();
  });

  it('NoStatsDialog renders just the className with no other props required', () => {
    const { NoStatsDialog } = slots;
    render(<NoStatsDialog isOpen onClose={() => undefined} className="Novice A" />);
    screen.getByText('Novice A');
  });
});

describe('EntryListDialogSlots — optional AreaCountSelectionDialog slot', () => {
  it('rendering when the slot IS provided works as expected', () => {
    const slots = makeFullSlots();
    const Dialog = slots.AreaCountSelectionDialog;
    // TypeScript narrowing: after the check, Dialog is the non-nullable type.
    if (!Dialog) throw new Error('slot expected');
    render(
      <Dialog
        isOpen
        onClose={() => undefined}
        classData={{ id: 1, element: 'Interior', level: 'Adv', class_name: 'AI' }}
        areaCountRequirements={{ min: 1, max: 3, maxTotalSeconds: 600 }}
        onSave={() => undefined}
      />,
    );
    screen.getByText('3');
  });

  it('consumers can conditionally check for and skip the slot when absent', () => {
    const slots = makeMinimalSlots();
    // The page would write something like:
    //   {slots.AreaCountSelectionDialog && <slots.AreaCountSelectionDialog {...} />}
    // Asserting the falsy-skip pattern here so a future refactor that
    // breaks the optional contract (e.g. making it required) fails loudly.
    const Dialog = slots.AreaCountSelectionDialog;
    expect(Dialog).toBeUndefined();
    // No render path attempted — that's the whole point.
  });
});
