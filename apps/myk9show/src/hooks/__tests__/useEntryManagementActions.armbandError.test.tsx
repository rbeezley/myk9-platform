/**
 * MYK9-1844: a refused armband save never shows database text in the armband dialog.
 * A number another dog already wears is told apart by its code and says so plainly;
 * any other failure gets one fixed sentence. Drives the real handler and the real dialog.
 */
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fromAny } from '@total-typescript/shoehorn';
import { render } from '@/test/utils/testUtils';
import { useEntryManagementActions } from '../useEntryManagementActions';
import { ArmbandDialog } from '@/components/entries/management/ArmbandDialog';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { setEntryArmband } from '@/services/database/armbands';
import { createDatabaseError } from '@/services/database/databaseError';
import { ArmbandInUseError } from '@/services/replication/armbandInUse';
import { ENTRY_ACTION_COPY, armbandInUseMessage } from '../entryManagementErrorCopy';

vi.mock('@/services/database/armbands', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/database/armbands')>()),
  setEntryArmband: vi.fn(),
}));
vi.mock('@/services/AuditService', () => ({ auditService: { log: vi.fn(), logAction: vi.fn() } }));
vi.mock('@/services/LoggingService', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

type ActionProps = Parameters<typeof useEntryManagementActions>[0];

const ranger: EntryManagementEntry = {
  id: 'entry-1',
  registrationId: 'registration-1',
  entryNumber: '',
  showId: 'show-1',
  dogId: 'dog-1',
  dogName: 'Ranger',
  ownerName: 'Owner',
  ownerEmail: 'owner@example.test',
  handlerName: 'Handler',
  classes: [],
  totalFee: 35,
  paidAmount: 0,
  entryStatus: EntryStatus.ACCEPTED,
  paymentStatus: PaymentStatus.PENDING,
  submittedAt: new Date('2026-05-08T12:00:00Z'),
  lastUpdated: new Date('2026-05-08T12:00:00Z'),
};

function Harness() {
  const [entries, setEntries] = useState([ranger]);
  const actions = useEntryManagementActions({
    entries,
    setEntries,
    selectedShowId: 'show-1',
    selectedShow: null,
    setError: vi.fn(),
    user: { id: 'secretary-1' },
  } as unknown as ActionProps);
  return (
    <>
      <button
        type="button"
        onClick={() => actions.setArmbandDialog({ open: true, entry: ranger, value: '' })}
      >
        Open armband
      </button>
      <ArmbandDialog
        dialogState={actions.armbandDialog}
        setDialogState={actions.setArmbandDialog}
        onAssign={actions.handleAssignArmband}
        onNextArmband={actions.handleNextArmband}
        isProcessing={actions.isProcessing}
      />
    </>
  );
}

async function assignArmband(value: string) {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole('button', { name: 'Open armband' }));
  const input = await screen.findByPlaceholderText('Enter armband number');
  await user.clear(input);
  await user.type(input, value);
  await user.click(screen.getByRole('button', { name: 'Assign armband' }));
}

describe('armband dialog error text (MYK9-1844)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('says the number is already in use when another dog wears it', async () => {
    vi.mocked(setEntryArmband).mockResolvedValue(
      fromAny({
        data: null,
        error: createDatabaseError(new ArmbandInUseError('205'), 'entries', 'assign_armband'),
      })
    );

    await assignArmband('205');

    expect(await screen.findByText(armbandInUseMessage('205'))).toBeInTheDocument();
    expect(armbandInUseMessage('205')).toBe(
      'Armband 205 is already in use by another dog in this show. Pick a different number.'
    );
    expect(screen.queryByText(/already assigned/)).not.toBeInTheDocument();
  });

  it('reads a server 23505 on the armband-number constraint as the number in use', async () => {
    vi.mocked(setEntryArmband).mockResolvedValue(
      fromAny({
        data: null,
        error: createDatabaseError({
          code: '23505',
          message:
            'duplicate key value violates unique constraint "armbands_show_id_armband_number_key"',
        }),
      })
    );

    await assignArmband('205');

    expect(await screen.findByText(armbandInUseMessage('205'))).toBeInTheDocument();
  });

  it('does not call a 23505 on the one-armband-per-dog constraint a taken number', async () => {
    vi.mocked(setEntryArmband).mockResolvedValue(
      fromAny({
        data: null,
        error: createDatabaseError({
          code: '23505',
          message: 'duplicate key value violates unique constraint "armbands_show_dog_unique"',
        }),
      })
    );

    await assignArmband('205');

    expect(await screen.findByText(ENTRY_ACTION_COPY.armbandFailed)).toBeInTheDocument();
    expect(screen.queryByText(armbandInUseMessage('205'))).not.toBeInTheDocument();
  });

  it('shows the fixed sentence, not the database text, for any other failure', async () => {
    const dbText = 'insert or update on table "armbands" violates foreign key constraint';
    vi.mocked(setEntryArmband).mockResolvedValue(
      fromAny({
        data: null,
        error: createDatabaseError({ code: '23503', message: dbText }, 'entries', 'assign_armband'),
      })
    );

    await assignArmband('205');

    expect(await screen.findByText(ENTRY_ACTION_COPY.armbandFailed)).toBeInTheDocument();
    expect(screen.queryByText(new RegExp('violates'))).not.toBeInTheDocument();
  });
});
