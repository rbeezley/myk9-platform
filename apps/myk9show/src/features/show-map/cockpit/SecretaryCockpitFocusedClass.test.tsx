import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { render } from '@/test/utils/testUtils';
import { replicatedPaperworkPrintsTable } from '@/services/replication';
import { showUndoToast } from '@/lib/undoToast';

import { SecretaryCockpitFocusedClass } from './SecretaryCockpitFocusedClass';
import type { ClassEntryBreakdown } from '@/features/entry-operations/classEntryBreakdown';
import type { FocusedClassModel, SecretaryCockpitClass } from './secretaryCockpitTypes';

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    user: {
      id: 'user-1',
      email: 'secretary@example.com',
      user_metadata: { full_name: 'Jannie' },
    },
  }),
}));
vi.mock('@/services/replication', () => ({
  replicatedPaperworkPrintsTable: {
    confirmPrinted: vi.fn(async () => ({ id: 'print-1' })),
    voidPrint: vi.fn(async () => undefined),
  },
}));
vi.mock('@/lib/undoToast', () => ({ showUndoToast: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/features/show-workbench/workbenchAnnouncementPost', () => ({
  useWorkbenchAnnouncementPost: () => ({ postAnnouncement: vi.fn() }),
}));

const focused: FocusedClassModel = {
  id: 'class-1',
  trialId: 'trial-1',
  name: 'Container Novice',
  timeLabel: '9:00 AM',
  scheduledStart: '9:00 AM',
  expectedStart: '9:00 AM',
  startedLabel: null,
  lifecycle: { evidence: 'recorded', value: 'not-started' },
  progress: { evidence: 'computed', value: { completed: 0, total: 8 } },
  judgeName: null,
  attentionCount: 0,
  closeout: 'none',
  statusLine: { text: 'Not started', parts: ['Not started'] },
  printTrackingInUse: true,
  actualStart: { evidence: 'unknown', value: null },
  actualFinish: { evidence: 'unknown', value: null },
  paperwork: [
    {
      reportId: 'check-in-sheet',
      label: 'Check-in sheet',
      state: 'unconfirmed',
      evidence: 'unknown',
      confirmation: {
        scope: { kind: 'class', showId: 'show-1', trialId: 'trial-1', classId: 'class-1' },
        coverage: { scopeKind: 'class', subjectFingerprints: { 'entry:1': 'fingerprint' } },
        fingerprint: 'document-fingerprint',
      },
    },
  ],
  classWorkActions: [],
  entryRows: [],
  entries: [],
  entriesHidden: 0,
};

/** A report outside the seven steps: its rows (record, undo, history) live under Other paperwork. */
const armbandFocused: FocusedClassModel = {
  ...focused,
  paperwork: [{ ...focused.paperwork[0]!, reportId: 'armband-labels', label: 'Armband labels' }],
};

const sourceClass: SecretaryCockpitClass = {
  id: 'class-1',
  trialId: 'trial-1',
  name: 'Container Novice',
  classOrder: 0,
  scheduledStart: '9:00 AM',
  lifecycle: 'not-started',
  entryCount: 8,
  scoredCount: 0,
  attention: [],
  actions: [],
  paperwork: [],
  entryRows: [],
};

describe('SecretaryCockpitFocusedClass paperwork', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('can explicitly record existing paperwork and offers Undo', async () => {
    const { user } = render(
      <SecretaryCockpitFocusedClass
        showId="show-1"
        focused={armbandFocused}
        sourceClass={sourceClass}
        trial={{ id: 'trial-1', date: '2026-07-20', number: '1', order: 0 }}
        attention={[]}
        timeZone="America/Chicago"
        canManageShow
        onCommand={vi.fn()}
      />
    );

    await user.click(screen.getByText('Other paperwork (1)'));
    await user.click(screen.getByRole('button', { name: 'Record as printed' }));
    expect(
      screen.getByRole('heading', { name: 'Did the Armband labels print correctly?' })
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mark printed' }));

    expect(replicatedPaperworkPrintsTable.confirmPrinted).toHaveBeenCalledWith(
      expect.objectContaining({
        reportId: 'armband-labels',
        printedBy: 'user-1',
        printedByName: 'Jannie',
      })
    );
    expect(showUndoToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Armband labels recorded as printed.' })
    );
    expect(screen.getByText('Not confirmed printed')).toBeInTheDocument();
  });

  it('shows stale broader-scope print evidence and append-only history', async () => {
    const staleFocused: FocusedClassModel = {
      ...armbandFocused,
      paperwork: [
        {
          ...armbandFocused.paperwork[0]!,
          state: 'stale',
          printedAt: '2026-07-20T14:42:00.000Z',
          printedBy: 'Jannie',
          coveredByScope: 'trial',
          printHref: '/shows/show-1/reports?scope=class',
          history: [
            {
              id: 'print-2',
              printedAt: '2026-07-20T14:42:00.000Z',
              printedBy: 'Jannie',
            },
            {
              id: 'print-1',
              printedAt: '2026-07-20T14:10:00.000Z',
              printedBy: 'Morgan',
              voidedAt: '2026-07-20T14:15:00.000Z',
            },
          ],
        },
      ],
    };
    const { user } = render(
      <SecretaryCockpitFocusedClass
        showId="show-1"
        focused={staleFocused}
        sourceClass={sourceClass}
        trial={{ id: 'trial-1', date: '2026-07-20', number: '1', order: 0 }}
        attention={[]}
        timeZone="America/Chicago"
        canManageShow
        onCommand={vi.fn()}
      />
    );

    await user.click(screen.getByText('Other paperwork (1)'));
    expect(
      screen.getByText(/Printed 9:42 AM by Jannie · Printed with the whole trial/)
    ).toBeInTheDocument();
    expect(screen.getByText(/Class data changed after printing/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /review and reprint/i })).toBeInTheDocument();

    await user.click(screen.getByText('Print history (2)'));
    expect(screen.getByText(/9:10 AM by Morgan · marked incorrect/)).toBeInTheDocument();
  });
});

describe('SecretaryCockpitFocusedClass checklist (MYK9-948)', () => {
  function renderChecklist(source: SecretaryCockpitClass, model: FocusedClassModel = focused) {
    return render(
      <SecretaryCockpitFocusedClass
        showId="show-1"
        focused={model}
        sourceClass={source}
        trial={{ id: 'trial-1', date: '2026-07-20', number: '1', order: 0 }}
        attention={[]}
        timeZone="America/Chicago"
        canManageShow
        onCommand={vi.fn()}
      />
    );
  }

  it('lists all seven items with a done count, opening print from print items', () => {
    renderChecklist(sourceClass);

    const checklist = screen.getByRole('region', { name: 'Class checklist' });
    const items = within(checklist).getAllByRole('listitem');
    expect(items.map(item => item.textContent)).toEqual([
      expect.stringContaining('Print paperwork'),
      expect.stringContaining('Class started'),
      expect.stringContaining('Scoring complete'),
      expect.stringContaining('Preliminary results'),
      expect.stringContaining('Result labels'),
      expect.stringContaining("Judge's initials collected"),
    ]);
    expect(within(checklist).getByText('0 of 7 done')).toBeInTheDocument();
    // The card opens the print records, so it is a button even when the sheet has no print link.
    expect(
      within(items[0]!).getByRole('button', {
        name: 'Print paperwork: check-in sheet. Not done, 0 of 1 printed. Show print records',
      })
    ).toBeInTheDocument();
    expect(within(items[3]!).getByText('Nothing to print yet')).toBeInTheDocument();
  });

  it('checks items off from class state and print records, in any order', () => {
    renderChecklist(
      {
        ...sourceClass,
        lifecycle: 'complete',
        scoredCount: 8,
        wrapUpStatus: 'needs-judge-signature',
      },
      { ...focused, paperwork: [{ ...focused.paperwork[0]!, state: 'current' }] }
    );

    const checklist = screen.getByRole('region', { name: 'Class checklist' });
    expect(within(checklist).getByText('3 of 7 done')).toBeInTheDocument();
  });

  it('names armband labels on the Print paperwork card and lists them under Other paperwork, outside the checklist count', () => {
    renderChecklist(sourceClass, {
      ...focused,
      paperwork: [
        ...focused.paperwork,
        {
          reportId: 'armband-labels',
          label: 'Armband labels',
          state: 'unconfirmed',
          evidence: 'computed',
        },
      ],
    });

    const checklist = screen.getByRole('region', { name: 'Class checklist' });
    expect(
      within(checklist).getByRole('button', {
        name: 'Print paperwork: armband labels, check-in sheet. Not done, 0 of 2 printed. Show print records',
      })
    ).toBeInTheDocument();
    expect(within(checklist).getByText('0 of 7 done')).toBeInTheDocument();
    // Other paperwork sits under the step bar, behind a disclosure.
    expect(screen.getByText('Other paperwork and print records (2)')).toBeInTheDocument();
    expect(screen.getByText('Armband labels')).toBeInTheDocument();
  });
});

// MYK9-954: the old Tools "Schedule slip script" moved to where the delay is set.
describe('SecretaryCockpitFocusedClass delay announcement', () => {
  function renderPanel(source: SecretaryCockpitClass, canManageShow = true) {
    return render(
      <SecretaryCockpitFocusedClass
        showId="show-1"
        focused={focused}
        sourceClass={source}
        trial={{ id: 'trial-1', date: '2026-07-20', number: '1', order: 0 }}
        attention={[]}
        timeZone="America/Chicago"
        canManageShow={canManageShow}
        onCommand={vi.fn()}
      />
    );
  }

  it('opens the delay script on this class and the minutes it runs late', async () => {
    // 9:00 AM scheduled; revised to 9:45 AM Chicago time.
    const { user } = renderPanel({
      ...sourceClass,
      revisedExpectedStart: '2026-07-20T14:45:00.000Z',
    });

    await user.click(screen.getByRole('button', { name: /^Actions for/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Announce a delay' }));

    const dialog = screen.getByRole('dialog', { name: 'Announce the delay' });
    // A slide-out, not a centered dialog (docs/INTENT.md, Decision vs Work).
    expect(dialog.querySelector('.slide-over-panel')).not.toBeNull();
    // Portaled to <body>, outside the sticky focused-class card's stacking context.
    expect(dialog.parentElement).toBe(document.body);
    expect(within(dialog).getByLabelText('Affected class')).toHaveValue('Container Novice');
    expect(within(dialog).getByLabelText('Delay minutes')).toHaveValue('45');
    expect((within(dialog).getByLabelText('PA script') as HTMLTextAreaElement).value).toContain(
      'about 45 minutes behind'
    );
  });

  async function expectDelayItem(source: SecretaryCockpitClass, offered: boolean) {
    const { user } = renderPanel(source);
    await user.click(screen.getByRole('button', { name: /^Actions for/ }));
    // Positive control: the menu opened and holds its other items.
    expect(await screen.findByRole('menuitem', { name: 'Score this class' })).toBeInTheDocument();
    const item = screen.queryByRole('menuitem', { name: 'Announce a delay' });
    if (offered) expect(item).not.toBeNull();
    else expect(item).toBeNull();
  }

  it('is not offered when the class is on time', async () => {
    await expectDelayItem(sourceClass, false);
  });

  it('is not offered to a viewer who cannot manage the show', () => {
    renderPanel({ ...sourceClass, revisedExpectedStart: '2026-07-20T14:45:00.000Z' }, false);
    expect(screen.queryByRole('button', { name: /^Actions for/ })).toBeNull();
  });

  it('is offered with editable minutes when the class has no scheduled start', async () => {
    const { user } = renderPanel({
      ...sourceClass,
      scheduledStart: null,
      revisedExpectedStart: '2026-07-20T14:45:00.000Z',
    });

    await user.click(screen.getByRole('button', { name: /^Actions for/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Announce a delay' }));
    const dialog = screen.getByRole('dialog', { name: 'Announce the delay' });
    expect(within(dialog).getByText(/is running behind\. Set the minutes/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Delay minutes')).toHaveValue('30');
  });

  it('is not offered when a revised start runs early', async () => {
    await expectDelayItem(
      { ...sourceClass, revisedExpectedStart: '2026-07-20T13:45:00.000Z' },
      false
    );
  });

  it('is not offered once the class has started, even with a revised start on record', async () => {
    await expectDelayItem(
      {
        ...sourceClass,
        lifecycle: 'in-progress',
        revisedExpectedStart: '2026-07-20T14:45:00.000Z',
      },
      false
    );
  });
});

describe('SecretaryCockpitFocusedClass layout (owner, 2026-10-03)', () => {
  function renderPanel(
    source: SecretaryCockpitClass,
    model: FocusedClassModel = focused,
    entryBreakdownByClassId?: ReadonlyMap<string, ClassEntryBreakdown>
  ) {
    return render(
      <SecretaryCockpitFocusedClass
        showId="show-1"
        focused={model}
        sourceClass={source}
        trial={{ id: 'trial-1', date: '2026-07-20', number: '1', order: 0 }}
        attention={[]}
        timeZone="America/Chicago"
        canManageShow
        onCommand={vi.fn()}
        entryBreakdownByClassId={entryBreakdownByClassId}
      />
    );
  }

  it('shows what the secretary sets as inline fields in the class header', () => {
    renderPanel(sourceClass);

    const settings = screen.getByTestId('focused-class-header');
    expect(within(settings).getByText('Status')).toBeInTheDocument();
    expect(within(settings).getByText('Expected start')).toBeInTheDocument();
    expect(within(settings).getByText('Actual timing')).toBeInTheDocument();
  });

  it('closes an open expected-start editor when the secretary moves to another class', async () => {
    const { user, rerender } = renderPanel(sourceClass);
    await user.click(
      within(screen.getByTestId('focused-class-header')).getByRole('button', { name: /9:00/ })
    );
    expect(screen.getByRole('button', { name: 'Save expected start' })).toBeInTheDocument();

    rerender(
      <SecretaryCockpitFocusedClass
        showId="show-1"
        focused={{ ...focused, id: 'class-2', name: 'Container Advanced' }}
        sourceClass={{ ...sourceClass, id: 'class-2', name: 'Container Advanced' }}
        trial={{ id: 'trial-1', date: '2026-07-20', number: '1', order: 0 }}
        attention={[]}
        timeZone="America/Chicago"
        canManageShow
        onCommand={vi.fn()}
      />
    );
    expect(screen.queryByRole('button', { name: 'Save expected start' })).not.toBeInTheDocument();
  });

  it('heads a started class with its scored count, not a redundant entry count', () => {
    renderPanel(
      { ...sourceClass, lifecycle: 'in-progress' },
      { ...focused, lifecycle: { evidence: 'recorded', value: 'in-progress' } }
    );
    const facts = screen.getByRole('heading', { level: 2 }).nextElementSibling;
    expect(facts).toHaveTextContent('0 of 8 scored');
    expect(facts).not.toHaveTextContent('8 entries');
  });

  it('heads a class that has not started with its entry count, not "0 of N scored"', () => {
    renderPanel(sourceClass);
    const facts = screen.getByRole('heading', { level: 2 }).nextElementSibling;
    expect(facts).toHaveTextContent('8 entries');
    expect(facts).not.toHaveTextContent('scored');
  });

  it('says a class that ran has no recorded start, rather than "Not started"', () => {
    renderPanel(
      { ...sourceClass, lifecycle: 'complete' },
      { ...focused, lifecycle: { evidence: 'recorded', value: 'complete' } }
    );

    const settings = screen.getByTestId('focused-class-header');
    expect(within(settings).getByText('Start not recorded')).toBeInTheDocument();
    expect(within(settings).queryByText('Not started')).toBeNull();
  });

  it('no longer lists "Can change class" apart from the entries table (MYK9-1798)', () => {
    renderPanel(sourceClass, {
      ...focused,
      entryRows: [
        {
          nodeId: 'entry:e-1',
          label: '#101 Moss',
          actions: [
            {
              id: 'move-up-entry',
              commandId: 'move-up-entry:entry:e-1',
              label: 'Change class',
              why: '',
            },
          ],
        },
      ],
    });

    expect(screen.queryByRole('heading', { name: 'Can change class' })).toBeNull();
    // Menus closed: no standalone per-dog "Change class" button remains.
    expect(screen.queryByRole('button', { name: /^Change class/ })).toBeNull();
  });

  it('counts entries the way the schedule row does: entered and pending (MYK9-1727)', () => {
    renderPanel(
      { ...sourceClass, entryCount: 0 },
      { ...focused, progress: { evidence: 'computed', value: { completed: 0, total: 0 } } },
      new Map([['class-1', { entered: 0, pending: 1 }]])
    );

    expect(screen.getByText('0 entered · 1 pending')).toBeInTheDocument();
    expect(screen.queryByText('0 entries')).toBeNull();
  });
});

// MYK9-1797: the Check-in cell changes a dog's status for a manager only.
describe('SecretaryCockpitFocusedClass Check-in cell', () => {
  const notCheckedIn = {
    nodeId: 'entry:e-1',
    entryId: 'e-1',
    armband: '101',
    dogName: 'Moss',
    checkIn: { value: 'no-status', label: 'Not checked in', kind: 'neutral' },
    checkInValue: 'no-status',
    deskEditable: true,
    lockedReason: 'Scored, so the status is locked',
    state: 'waiting',
    counted: true,
    notCheckedIn: true,
    place: 1,
    result: null,
  } as const;
  const withEntries: FocusedClassModel = { ...focused, entries: [notCheckedIn] };

  function renderEntries(canManageShow: boolean) {
    return render(
      <SecretaryCockpitFocusedClass
        showId="show-1"
        focused={withEntries}
        sourceClass={sourceClass}
        trial={{ id: 'trial-1', date: '2026-07-20', number: '1', order: 0 }}
        attention={[]}
        timeZone="America/Chicago"
        canManageShow={canManageShow}
        onCommand={vi.fn()}
      />
    );
  }

  it('gives a manager a button on a dog that is not checked in, saying "Not checked in" once', () => {
    renderEntries(true);
    const row = screen.getByTestId('class-entry-row');
    expect(
      within(row).getByRole('button', { name: 'Change check-in for Moss: Not checked in' })
    ).toBeInTheDocument();
    expect(within(row).getAllByText('Not checked in')).toHaveLength(1);
  });

  it('gives a non-manager no Check-in button and no locked reason, even for a dog not checked in', () => {
    renderEntries(false);
    const row = screen.getByTestId('class-entry-row');
    expect(within(row).queryByRole('button', { name: /Change check-in/ })).toBeNull();
    expect(within(row).getAllByText('Not checked in')).toHaveLength(1);
    expect(within(row).queryByText('Scored, so the status is locked')).toBeNull();
  });
});

// MYK9-1798: the per-dog menu in the entries table, joined to the engine's rows by nodeId.
describe('SecretaryCockpitFocusedClass per-dog menu', () => {
  const entry = (id: string, dogName: string) =>
    ({
      nodeId: `entry:${id}`,
      entryId: id,
      armband: '101',
      dogName,
      checkIn: { value: 'no-status', label: 'Not checked in', kind: 'neutral' },
      checkInValue: 'no-status',
      deskEditable: true,
      lockedReason: null,
      state: 'waiting',
      counted: true,
      notCheckedIn: true,
      place: 1,
      result: null,
    }) as const;
  const moveUp = (id: string) => ({
    id: 'move-up-entry',
    commandId: `move-up-entry:entry:${id}`,
    label: 'Change class',
    why: 'Move this dog to another class',
  });
  const both = (id: string) => [
    moveUp(id),
    {
      id: 'other-entry-action',
      commandId: `other-entry-action:entry:${id}`,
      label: 'Move up a level',
      why: '',
    },
  ];
  const model: FocusedClassModel = {
    ...focused,
    entries: [entry('e-1', 'Moss'), entry('e-2', 'Scout'), entry('e-3', 'Juno')],
    entryRows: [
      { nodeId: 'entry:e-1', label: '#101 Moss', actions: both('e-1') },
      { nodeId: 'entry:e-2', label: '#102 Scout', actions: [moveUp('e-2')] },
      { nodeId: 'entry:e-3', label: '#103 Juno', actions: [] },
    ],
  };

  function renderMenu(canManageShow: boolean, onCommand = vi.fn(), focusedModel = model) {
    return render(
      <SecretaryCockpitFocusedClass
        showId="show-1"
        focused={focusedModel}
        sourceClass={sourceClass}
        trial={{ id: 'trial-1', date: '2026-07-20', number: '1', order: 0 }}
        attention={[]}
        timeZone="America/Chicago"
        canManageShow={canManageShow}
        onCommand={onCommand}
      />
    );
  }

  it('shows both items for an eligible row and only the allowed one for another', async () => {
    const { user } = renderMenu(true);
    await user.click(screen.getByRole('button', { name: 'Actions for #101 Moss' }));
    expect((await screen.findAllByRole('menuitem')).map(item => item.textContent)).toEqual([
      'Change class',
      'Move up a level',
    ]);
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: 'Actions for #101 Scout' }));
    expect((await screen.findAllByRole('menuitem')).map(item => item.textContent)).toEqual([
      'Change class',
    ]);
  });

  it('shows no trigger on a row with no allowed action', () => {
    renderMenu(true);
    expect(screen.queryByRole('button', { name: 'Actions for #101 Juno' })).toBeNull();
  });

  it('shows no trigger to a non-manager', () => {
    renderMenu(false);
    expect(screen.queryByRole('button', { name: /^Actions for (Moss|Scout|Juno)$/ })).toBeNull();
  });

  it("calls onCommand with the chosen item's commandId", async () => {
    const onCommand = vi.fn();
    const { user } = renderMenu(true, onCommand);
    await user.click(screen.getByRole('button', { name: 'Actions for #101 Moss' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Move up a level' }));
    expect(onCommand).toHaveBeenCalledWith('other-entry-action:entry:e-1');
  });
});
