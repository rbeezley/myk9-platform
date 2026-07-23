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

function renderCockpit(onStatusChange: StatusChangeHandler) {
  const entry = makeEntry();
  const registrationGroups = groupEntriesByShowRegistration([entry]);

  return render(
    <EntryManagementCockpit
      entries={[entry]}
      registrationGroups={registrationGroups}
      cockpitState={{
        tab: 'registrations',
        exception: 'move-ups',
        queue: 'needs-review',
        search: '',
        density: 'comfortable',
        trialId: null,
        classId: null,
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
      onBulkCheckIn={vi.fn()}
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
      screen.getByRole('button', { name: 'Change entry status for Fido in Novice A' })
    );
    await user.click(screen.getByRole('menuitem', { name: 'Accept entry' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't update status.");
    expect(onStatusChange).toHaveBeenCalledWith('entry-1', EntryStatus.ACCEPTED, undefined);
  });
});
