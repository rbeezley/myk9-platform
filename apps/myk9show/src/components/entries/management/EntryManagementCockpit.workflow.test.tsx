import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import type { ShowRegistrationGroup } from './showRegistrationProjection';
import { groupEntriesByShowRegistration } from './showRegistrationProjection';
import { EntryManagementCockpit } from './EntryManagementCockpit';

vi.mock('@/hooks/useElementWidth', () => ({
  useElementWidth: () => ({ ref: { current: null }, width: 1000 }),
}));

vi.mock('@/hooks/useEmailStatus', () => ({
  useEmailStatus: () => ({ data: {} }),
}));

vi.mock('@/features/lifecycle-emails', () => ({
  useEntryDecisionLifecycleEmails: () => ({
    statusMap: {},
    dialog: null,
    openDecisionPrompt: vi.fn(),
    reviewReadyEmail: vi.fn(),
    prepareCorrectionEmail: vi.fn(),
  }),
}));

vi.mock('./EntryFocusedRegistration', async () => {
  const { EntryStatusPopover } = await import('./EntryStatusPopover');

  return {
    EntryFocusedRegistration: ({
      registration,
      onStatusChange,
    }: {
      registration: Pick<ShowRegistrationGroup, 'entries'>;
      onStatusChange: (
        entryId: string,
        status: EntryStatus,
        withdrawalReason?: string
      ) => void | boolean | Promise<boolean | void>;
    }) => {
      const entry = registration.entries[0]!;
      return (
        <EntryStatusPopover
          entry={entry}
          entryClassName={entry.classes[0]!.name}
          onStatusChange={onStatusChange}
        />
      );
    },
  };
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
  withdrawalReason?: string
) => void | boolean | Promise<boolean | void>;

interface RenderCockpitOptions {
  entries?: EntryManagementEntry[];
  search?: string;
  classId?: string | null;
  trialId?: string | null;
}

function renderCockpit(onStatusChange: StatusChangeHandler, options: RenderCockpitOptions = {}) {
  const entries = options.entries ?? [makeEntry()];
  const registrationGroups = groupEntriesByShowRegistration(entries);

  return render(
    <EntryManagementCockpit
      entries={entries}
      registrationGroups={registrationGroups}
      cockpitState={{
        tab: 'registrations',
        exception: 'move-ups',
        queue: 'needs-review',
        search: options.search ?? '',
        density: 'comfortable',
        trialId: options.trialId ?? null,
        classId: options.classId ?? null,
        registrationKey: null,
      }}
      trials={[]}
      trialClasses={[]}
      trialClassIds={[]}
      isLoadingTrials={false}
      isLoadingClasses={false}
      showId="show-1"
      onStatusChange={onStatusChange}
      onCheckInStatusChange={vi.fn()}
      onOpenArmbandDialog={vi.fn()}
      onOpenCompDialog={vi.fn()}
      onUncompEntry={vi.fn()}
      onRemoveEntry={vi.fn()}
      onBulkStatusChange={vi.fn()}
      onPaymentStatusChange={vi.fn()}
      onSendDecisionEmail={vi.fn().mockResolvedValue(undefined)}
      onRefresh={vi.fn()}
    />
  );
}

describe('EntryManagementCockpit status seam', () => {
  it('propagates a failed production mutation to the status popover retry state', async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn<StatusChangeHandler>(async () => false);
    renderCockpit(onStatusChange);

    await user.click(
      screen.getByRole('button', { name: /change entry status for Fido in Novice A/i })
    );
    await user.click(screen.getByRole('menuitem', { name: 'Accept' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't update status.");
    expect(onStatusChange).toHaveBeenCalledWith('entry-1', EntryStatus.ACCEPTED, undefined);
  });
});

describe('EntryManagementCockpit queue chips (F19)', () => {
  // The active queue was signalled by colour alone. A show with one entry lands on
  // "Needs review", reads "No matching registrations", and shows "All registrations 1"
  // beside it with nothing saying which filter is responsible. The Exceptions
  // sub-tabs on this same page already exposed a pressed state.
  it('marks the active queue and leaves the rest unpressed', () => {
    renderCockpit(vi.fn<StatusChangeHandler>(async () => true));

    expect(screen.getByRole('button', { name: /Needs review/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    for (const label of [/Missing information/, /Payment due/, /All registrations/]) {
      expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'false');
    }
  });

  it('exposes the queue chips as a labelled group', () => {
    renderCockpit(vi.fn<StatusChangeHandler>(async () => true));

    expect(screen.getByRole('group', { name: 'Registration queues' })).toBeInTheDocument();
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
      '2 registrations · 3 entries. All registrations includes Needs review.'
    );
  });

  it('says "registration" and "entry" in the singular for a one-entry show', () => {
    renderCockpit(vi.fn<StatusChangeHandler>(async () => true));

    expect(screen.getByTestId('registration-totals')).toHaveTextContent(
      '1 registration · 1 entry.'
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
