import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { useEntryManagementCockpit } from '@/hooks/useEntryManagementCockpit';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type {
  BulkStatusChangeOptions,
  EntryManagementEntry,
  StatusChangeOptions,
} from '@/types/entry-management-types';
import type { EntryManagementCockpitState } from './entryManagementCockpitParams';
import type { ShowRegistrationGroup } from './showRegistrationProjection';
import {
  getEntryRegistrationRowId,
  groupEntriesByShowRegistration,
} from './showRegistrationProjection';
import { EntryManagementCockpit } from './EntryManagementCockpit';

vi.mock('@/hooks/useElementWidth', () => ({
  useElementWidth: () => ({ ref: { current: null }, width: window.innerWidth }),
}));

vi.mock('@/hooks/useEmailStatus', () => ({
  useEmailStatus: () => ({ data: {} }),
}));

const decisionEmails = vi.hoisted(() => ({
  plan: 'none' as 'send' | 'preview' | 'none',
  openDecisionPrompt: vi.fn(),
  sendDecisionEmail: vi.fn(),
  hookArgs: vi.fn(),
}));

vi.mock('@/features/lifecycle-emails', () => ({
  useEntryDecisionLifecycleEmails: (args: unknown) => {
    decisionEmails.hookArgs(args);
    return decisionEmailsResult();
  },
}));

function decisionEmailsResult() {
  return {
    statusMap: {},
    dialog: null,
    decisionEmailPlan: () => decisionEmails.plan,
    openDecisionPrompt: decisionEmails.openDecisionPrompt,
    sendDecisionEmail: decisionEmails.sendDecisionEmail,
    reviewReadyEmail: vi.fn(),
    prepareCorrectionEmail: vi.fn(),
  };
}

vi.mock('./EntryFocusedRegistration', async () => {
  const { EntryStatusPopover } = await import('./EntryStatusPopover');

  return {
    EntryFocusedRegistration: ({
      registration,
      onStatusChange,
      onBulkStatusChange,
      onBack,
    }: {
      registration: Pick<ShowRegistrationGroup, 'entries'>;
      onBack?: () => void;
      onBulkStatusChange: (entryIds: string[], status: EntryStatus) => void;
      onStatusChange: (
        entryId: string,
        status: EntryStatus,
        withdrawalReason?: string
      ) => void | boolean | Promise<boolean | void>;
    }) => {
      const entry = registration.entries[0]!;
      return (
        <>
          {onBack && (
            <button type="button" onClick={onBack}>
              Back to list
            </button>
          )}
          <button
            type="button"
            onClick={() =>
              onBulkStatusChange(
                registration.entries.map(candidate => candidate.id),
                EntryStatus.ACCEPTED
              )
            }
          >
            Accept whole form
          </button>
          <EntryStatusPopover
            entry={entry}
            entryClassName={entry.classes[0]!.name}
            onStatusChange={onStatusChange}
          />
        </>
      );
    },
  };
});

// File-wide, not per describe: CI shuffles test order, and a plan left on 'send' changes what
// every other test here sees `onStatusChange` called with.
beforeEach(() => {
  decisionEmails.plan = 'none';
  decisionEmails.openDecisionPrompt.mockClear();
  decisionEmails.sendDecisionEmail.mockClear();
  decisionEmails.hookArgs.mockClear();
});

function makeEntry(overrides: Partial<EntryManagementEntry> = {}): EntryManagementEntry {
  return {
    id: 'entry-1',
    registrationId: 'registration-1',
    entryNumber: '#1',
    showId: 'show-1',
    dogId: 'dog-1',
    dogName: 'Fido',
    ownerName: 'Jane Smith',
    ownerEmail: 'jane@example.com',
    handlerName: 'Jane Smith',
    classes: [
      {
        id: 'class-1',
        name: 'Novice A',
        number: '101',
        fee: 25,
        status: 'entered',
      },
    ],
    totalFee: 25,
    paidAmount: 25,
    entryStatus: EntryStatus.PENDING,
    paymentStatus: PaymentStatus.PAID_ONLINE,
    submittedAt: new Date('2026-01-01'),
    lastUpdated: new Date('2026-01-01'),
    ...overrides,
  };
}

type StatusChangeHandler = (
  entryId: string,
  status: EntryStatus,
  withdrawalReason?: string,
  options?: StatusChangeOptions
) => void | boolean | Promise<boolean | void>;

interface RenderCockpitOptions {
  entries?: EntryManagementEntry[];
  search?: string;
  classId?: string | null;
  trialId?: string | null;
  registrationKey?: string | null;
  sendDecisionEmailsUnasked?: boolean;
  onBulkStatusChange?: BulkHandler;
}

type BulkHandler = (
  entryIds: string[],
  status: EntryStatus,
  onFullSuccess?: () => void,
  options?: BulkStatusChangeOptions
) => boolean | void | Promise<boolean | void>;

// MYK9-795: `EntryManagementCockpit` no longer computes its own cockpit state
// (queue buttons, search, Trial/Class filters moved to the page-level
// `EntryManagementViewToolbar`/`ListViewTabs`+`ListFilterBar` — covered by
// `EntryManagementPage.tabs.test.tsx`). This harness calls the same
// `useEntryManagementCockpit` hook the page calls, so these tests exercise
// the real prop the page hands the component.
function Harness({
  onStatusChange,
  options,
}: {
  onStatusChange: StatusChangeHandler;
  options: RenderCockpitOptions;
}) {
  const entries = options.entries ?? [makeEntry()];
  const registrationGroups = groupEntriesByShowRegistration(entries);
  const state: EntryManagementCockpitState = {
    tab: 'registrations',
    exception: 'move-ups',
    queues: ['needs-review'],
    search: options.search ?? '',
    trialIds: options.trialId ? [options.trialId] : [],
    classIds: options.classId ? [options.classId] : [],
    registrationKey: options.registrationKey ?? null,
  };
  const cockpit = useEntryManagementCockpit({ groups: registrationGroups, state });

  return (
    <EntryManagementCockpit
      entries={entries}
      cockpit={cockpit}
      showHasNoRegistrations={registrationGroups.length === 0}
      trialScopePending={false}
      showId="show-1"
      {...(options.sendDecisionEmailsUnasked === undefined
        ? {}
        : { sendDecisionEmailsUnasked: options.sendDecisionEmailsUnasked })}
      onStatusChange={onStatusChange}
      onCheckInStatusChange={vi.fn()}
      onOpenArmbandDialog={vi.fn()}
      onOpenCompDialog={vi.fn()}
      onUncompEntry={vi.fn()}
      onEntryRemoved={vi.fn()}
      onBulkStatusChange={options.onBulkStatusChange ?? vi.fn()}
      paymentLedger={{ record: vi.fn(), markPaidOnline: vi.fn(), todayInShowZone: '2026-09-17' }}
      onSendDecisionEmail={vi.fn().mockResolvedValue(undefined)}
      onRefresh={vi.fn()}
    />
  );
}

function renderCockpit(onStatusChange: StatusChangeHandler, options: RenderCockpitOptions = {}) {
  return render(<Harness onStatusChange={onStatusChange} options={options} />);
}

describe('EntryManagementCockpit status seam', () => {
  it('opens a late-resolved URL focus on a compact screen', async () => {
    const previousWidth = window.innerWidth;
    window.innerWidth = 800;
    try {
      const onStatusChange = vi.fn<StatusChangeHandler>(async () => true);
      const { rerender } = render(
        <Harness onStatusChange={onStatusChange} options={{ registrationKey: null }} />
      );
      expect(screen.queryByRole('button', { name: /change entry status for Fido/i })).toBeNull();

      rerender(
        <Harness onStatusChange={onStatusChange} options={{ registrationKey: 'registration-1' }} />
      );
      expect(
        await screen.findByRole('button', { name: /change entry status for Fido in Novice A/i })
      ).toBeInTheDocument();
    } finally {
      window.innerWidth = previousWidth;
    }
  });

  it('returns focus to the row after Back to list on a compact screen', async () => {
    const previousWidth = window.innerWidth;
    window.innerWidth = 800;
    try {
      const onStatusChange = vi.fn<StatusChangeHandler>(async () => true);
      const user = userEvent.setup();
      const entries = [
        makeEntry(),
        makeEntry({
          id: 'entry-2',
          registrationId: 'registration-2',
          dogId: 'dog-2',
          dogName: 'Rex',
        }),
      ];
      const harness = (registrationKey: string | null) => (
        <Harness onStatusChange={onStatusChange} options={{ entries, registrationKey }} />
      );
      const { rerender } = render(harness('registration-2'));

      await user.click(await screen.findByRole('button', { name: 'Back to list' }));
      // The URL drops the open form after the click; focus waits until the list has re-rendered.
      // (This pins the ordering; the browser race it guards is timing jsdom does not reproduce.)
      await new Promise(resolve => setTimeout(resolve, 50));
      rerender(harness(null));

      await waitFor(() =>
        expect(document.activeElement?.id).toBe(getEntryRegistrationRowId('registration-2'))
      );
    } finally {
      window.innerWidth = previousWidth;
    }
  });

  it('propagates a failed production mutation to the status popover retry state', async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn<StatusChangeHandler>(async () => false);
    renderCockpit(onStatusChange);

    await user.click(
      screen.getByRole('button', { name: /change entry status for Fido in Novice A/i })
    );
    await user.click(screen.getByRole('menuitem', { name: 'Accept' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't update status.");
    expect(onStatusChange).toHaveBeenCalledWith(
      'entry-1',
      EntryStatus.ACCEPTED,
      undefined,
      undefined
    );
  });
});

describe('EntryManagementCockpit decision email after Accept (MYK9-1800)', () => {
  async function accept(onStatusChange: StatusChangeHandler) {
    const user = userEvent.setup();
    renderCockpit(onStatusChange);
    await user.click(
      screen.getByRole('button', { name: /change entry status for Fido in Novice A/i })
    );
    await user.click(screen.getByRole('menuitem', { name: 'Accept' }));
    await waitFor(() => expect(onStatusChange).toHaveBeenCalled());
  }

  it('live show: hands the save an onStood that sends the email from the entry as it then is', async () => {
    decisionEmails.plan = 'send';
    const onStatusChange = vi.fn<StatusChangeHandler>(async () => true);
    await accept(onStatusChange);

    expect(decisionEmails.sendDecisionEmail).not.toHaveBeenCalled();
    expect(decisionEmails.openDecisionPrompt).not.toHaveBeenCalled();

    const stood = makeEntry({ entryStatus: EntryStatus.ACCEPTED, armbandNumber: '742' });
    onStatusChange.mock.calls[0]?.[3]?.onStood?.(stood);

    expect(decisionEmails.sendDecisionEmail).toHaveBeenCalledWith([stood], 'accepted', 'this show');
    expect(decisionEmails.openDecisionPrompt).not.toHaveBeenCalled();
  });

  it('draft or finished show: opens the preview after the save, and arms no automatic send', async () => {
    decisionEmails.plan = 'preview';
    const onStatusChange = vi.fn<StatusChangeHandler>(async () => true);
    await accept(onStatusChange);

    await waitFor(() =>
      expect(decisionEmails.openDecisionPrompt).toHaveBeenCalledWith(
        [expect.objectContaining({ id: 'entry-1', entryStatus: EntryStatus.ACCEPTED })],
        'accepted'
      )
    );
    expect(onStatusChange.mock.calls[0]?.[3]).toBeUndefined();
  });

  it('does not open the preview when the status did not save', async () => {
    decisionEmails.plan = 'preview';
    const onStatusChange = vi.fn<StatusChangeHandler>(async () => false);
    await accept(onStatusChange);

    await screen.findByRole('alert');
    expect(decisionEmails.openDecisionPrompt).not.toHaveBeenCalled();
  });

  it('tells the email hook whether this show sends unasked, and defaults to the preview', () => {
    const noop = vi.fn<StatusChangeHandler>(async () => true);
    renderCockpit(noop).unmount();
    expect(decisionEmails.hookArgs).toHaveBeenLastCalledWith(
      expect.objectContaining({ sendUnasked: false })
    );

    renderCockpit(noop, { sendDecisionEmailsUnasked: true });
    expect(decisionEmails.hookArgs).toHaveBeenLastCalledWith(
      expect.objectContaining({ sendUnasked: true })
    );
  });

  it('email switched off: no send is armed and nothing opens', async () => {
    decisionEmails.plan = 'none';
    const onStatusChange = vi.fn<StatusChangeHandler>(async () => true);
    await accept(onStatusChange);

    expect(onStatusChange.mock.calls[0]?.[3]).toBeUndefined();
    expect(decisionEmails.openDecisionPrompt).not.toHaveBeenCalled();
  });
});

describe('EntryManagementCockpit decision email from an entry form (MYK9-1800)', () => {
  it("the form's Accept all sends ONE email for the whole form once the decision stands", async () => {
    decisionEmails.plan = 'send';
    const user = userEvent.setup();
    const entries = [
      makeEntry({ id: 'entry-1' }),
      makeEntry({
        id: 'entry-2',
        classes: [{ id: 'c2', name: 'Open B', number: '102', fee: 25, status: 'entered' }],
      }),
    ];
    const onBulkStatusChange = vi.fn<BulkHandler>(async () => true);
    renderCockpit(
      vi.fn<StatusChangeHandler>(async () => true),
      { entries, onBulkStatusChange }
    );

    await user.click(screen.getByRole('button', { name: 'Accept whole form' }));
    await waitFor(() => expect(onBulkStatusChange).toHaveBeenCalled());
    expect(decisionEmails.sendDecisionEmail).not.toHaveBeenCalled();

    const stood = entries.map(entry => ({ ...entry, entryStatus: EntryStatus.ACCEPTED }));
    onBulkStatusChange.mock.calls[0]?.[3]?.onStood?.(stood);

    expect(decisionEmails.sendDecisionEmail).toHaveBeenCalledTimes(1);
    expect(decisionEmails.sendDecisionEmail).toHaveBeenCalledWith(stood, 'accepted', 'this show');
  });
});

describe('EntryManagementCockpit whole-show totals line (MYK9-635)', () => {
  // One registration holding two entries in two different classes, plus a
  // second standalone registration: 2 registrations, 3 entries. The numbers
  // differ, which is the whole point -- "All registrations 514" beside a show
  // page saying 517 entries was read as a bucket that excluded Needs review,
  // and it never was: the two count different things.
  const SPLIT_CLASS_ENTRIES: EntryManagementEntry[] = [
    makeEntry({
      id: 'e1',
      dogId: 'dog-1',
      registrationId: 'reg-shared',
      classes: [
        {
          id: 'class-a',
          classId: 'class-a',
          name: 'Novice A',
          number: '1',
          fee: 25,
          status: 'entered',
        },
      ],
    }),
    makeEntry({
      id: 'e2',
      dogId: 'dog-2',
      registrationId: 'reg-shared',
      classes: [
        {
          id: 'class-b',
          classId: 'class-b',
          name: 'Novice B',
          number: '2',
          fee: 25,
          status: 'entered',
        },
      ],
    }),
    makeEntry({
      id: 'e3',
      dogId: 'dog-3',
      registrationId: 'reg-solo',
      classes: [
        {
          id: 'class-b',
          classId: 'class-b',
          name: 'Novice B',
          number: '2',
          fee: 25,
          status: 'entered',
        },
      ],
    }),
  ];

  it('states both numbers when nothing is filtered', () => {
    renderCockpit(
      vi.fn<StatusChangeHandler>(async () => true),
      { entries: SPLIT_CLASS_ENTRIES }
    );

    expect(screen.getByTestId('registration-totals')).toHaveTextContent(
      '3 entries from 2 entry forms. The All view includes Needs review.'
    );
  });

  it('says "entry form" and "entry" in the singular for a one-entry show', () => {
    renderCockpit(vi.fn<StatusChangeHandler>(async () => true));

    expect(screen.getByTestId('registration-totals')).toHaveTextContent(
      '1 entry from 1 entry form.'
    );
  });

  it('withholds the line under a class scope rather than printing a wrong entry count', () => {
    // `scopeShowRegistrationGroups` keeps whole REGISTRATIONS whose entries
    // touch the class, so summing their entry counts would report 2 entries for
    // a class holding exactly one (e1 in class-a; e2 is in class-b under the
    // same registration). A number that is wrong for the current view is the
    // bug this line exists to fix, so it is not printed at all.
    renderCockpit(
      vi.fn<StatusChangeHandler>(async () => true),
      {
        entries: SPLIT_CLASS_ENTRIES,
        classId: 'class-a',
      }
    );

    expect(screen.queryByTestId('registration-totals')).toBeNull();
  });

  it('withholds the line under a trial scope', () => {
    renderCockpit(
      vi.fn<StatusChangeHandler>(async () => true),
      {
        entries: SPLIT_CLASS_ENTRIES,
        trialId: 'trial-1',
      }
    );

    expect(screen.queryByTestId('registration-totals')).toBeNull();
  });

  it('withholds the line under a search, where it would describe the whole show', () => {
    renderCockpit(
      vi.fn<StatusChangeHandler>(async () => true),
      {
        entries: SPLIT_CLASS_ENTRIES,
        search: 'fido',
      }
    );

    expect(screen.queryByTestId('registration-totals')).toBeNull();
  });
});
