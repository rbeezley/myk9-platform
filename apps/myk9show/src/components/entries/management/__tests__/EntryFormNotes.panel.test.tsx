import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { ENTRY_FORM_NOTES_PRIVATE_LABEL } from '@/features/entry-form-notes/EntryFormNotes';
import { groupEntriesByShowRegistration } from '../showRegistrationProjection';
import { EntryFocusedRegistration } from '../EntryFocusedRegistration';

vi.mock('@/hooks/useNetworkStatus', () => ({ useIsOnline: () => true }));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    userWithRoles: { databaseUserId: 'person-me' },
    hasRole: () => false,
  }),
}));
vi.mock('@/services/database/entry-form-notes', () => ({
  listEntryFormNotes: vi.fn(async () => []),
  addEntryFormNote: vi.fn(),
  updateEntryFormNote: vi.fn(),
  deleteEntryFormNote: vi.fn(),
}));

const entry: EntryManagementEntry = {
  id: 'entry-1',
  registrationId: 'registration-1',
  entryNumber: 'entry-1',
  showId: 'show-1',
  dogId: 'dog-1',
  dogName: 'Poppy',
  ownerName: 'Alice Martin',
  ownerEmail: 'alice@example.com',
  handlerName: 'Alice Martin',
  classes: [
    {
      id: 'class-entry-1',
      classId: 'class-1',
      name: 'Container Novice A',
      number: '1',
      fee: 25,
      status: 'entered',
    },
  ],
  totalFee: 25,
  paidAmount: 0,
  entryStatus: EntryStatus.PENDING,
  paymentStatus: PaymentStatus.PENDING,
  submittedAt: new Date('2026-07-12T13:42:00Z'),
  lastUpdated: new Date('2026-07-12T13:42:00Z'),
  confirmationNumber: 'MYK9-1001',
};

function panel(enrollmentId: string | null) {
  const group = groupEntriesByShowRegistration([entry])[0]!;
  const registration = { ...group, enrollmentId } as typeof group;
  return (
    <EntryFocusedRegistration
      registration={registration}
      onStatusChange={vi.fn()}
      onCheckInStatusChange={vi.fn()}
      onOpenArmbandDialog={vi.fn()}
      onEntryRemoved={vi.fn()}
      onBulkStatusChange={vi.fn()}
      paymentLedger={{ record: vi.fn(), markPaidOnline: vi.fn(), todayInShowZone: '2026-09-17' }}
    />
  );
}

describe('entry form private notes in the panel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the private Notes section and the menu item focuses the add-note input', async () => {
    const { user } = render(panel('enrollment-1'));
    expect(screen.getByText(ENTRY_FORM_NOTES_PRIVATE_LABEL)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /more actions for alice martin/i }));
    await user.click(await screen.findByRole('menuitem', { name: /add private note/i }));
    await waitFor(() => expect(screen.getByLabelText('New note')).toHaveFocus());
  });

  it('adds no menu item and no Notes section without an enrollment row', async () => {
    const { user } = render(panel(null));
    expect(screen.queryByText(ENTRY_FORM_NOTES_PRIVATE_LABEL)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /more actions for alice martin/i }));
    expect(screen.queryByRole('menuitem', { name: /add private note/i })).not.toBeInTheDocument();
  });
});
