/**
 * MYK9-1407: Comp on an entry that is already paid is refused, and the row the
 * secretary sees keeps `paid`. Undo shows the status the server restored, not
 * an assumed `pending`. Drives the real handler over real list state.
 */
import { act, renderHook } from '@/test/utils/testUtils';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEntryManagementActions } from '../useEntryManagementActions';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { COMP_REFUSED_PAID_MESSAGE, compEntry, uncompEntry } from '@/services/database/entries';
import { createDatabaseError } from '@/services/database/databaseError';
import { fromAny } from '@total-typescript/shoehorn';

vi.mock('@/services/database/entries', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/database/entries')>()),
  compEntry: vi.fn(),
  uncompEntry: vi.fn(),
}));
vi.mock('@/services/AuditService', () => ({ auditService: { log: vi.fn(), logAction: vi.fn() } }));
vi.mock('@/services/LoggingService', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

type ActionProps = Parameters<typeof useEntryManagementActions>[0];

function makeEntry(overrides: Partial<EntryManagementEntry>): EntryManagementEntry {
  return {
    id: 'entry-1',
    registrationId: 'registration-1',
    entryNumber: '',
    showId: 'show-1',
    dogId: 'dog-1',
    dogName: 'Ditto',
    ownerName: 'Owner',
    ownerEmail: 'owner@example.test',
    handlerName: 'Handler',
    classes: [],
    totalFee: 35,
    paidAmount: 35,
    entryStatus: EntryStatus.ACCEPTED,
    paymentStatus: PaymentStatus.PAID_BY_CHECK,
    submittedAt: new Date('2026-05-08T12:00:00Z'),
    lastUpdated: new Date('2026-05-08T12:00:00Z'),
    ...overrides,
  };
}

function renderWithEntries(initial: EntryManagementEntry[], setError = vi.fn()) {
  return renderHook(() => {
    const [entries, setEntries] = useState(initial);
    const actions = useEntryManagementActions({
      entries,
      setEntries,
      selectedShowId: 'show-1',
      selectedShow: null,
      showTimeZone: 'America/Chicago',
      setError,
      user: { id: 'secretary-1' },
    } as unknown as ActionProps);
    return { entries, actions };
  });
}

describe('useEntryManagementActions comp on a paid entry (MYK9-1407)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('refuses the comp with a plain message and the row keeps paid', async () => {
    vi.mocked(compEntry).mockResolvedValue(
      fromAny({
        data: null,
        error: createDatabaseError(
          { code: 'MKCMP', message: 'comp_refused_paid_entry' },
          'entries',
          'comp_entry'
        ),
      })
    );
    const setError = vi.fn();
    const { result } = renderWithEntries([makeEntry({})], setError);

    await act(async () => {
      await result.current.actions.handleCompEntry('entry-1', 'Judge error');
    });

    expect(setError).toHaveBeenCalledWith(COMP_REFUSED_PAID_MESSAGE);
    expect(COMP_REFUSED_PAID_MESSAGE).not.toMatch(/—/);
    const row = result.current.entries.find(entry => entry.id === 'entry-1');
    expect(row?.paymentStatus).toBe(PaymentStatus.PAID_BY_CHECK);
    expect(row?.comped).toBeFalsy();
  });

  it('keeps the generic message for any other failure', async () => {
    vi.mocked(compEntry).mockResolvedValue(
      fromAny({ data: null, error: createDatabaseError({ code: '42501', message: 'denied' }) })
    );
    const setError = vi.fn();
    const { result } = renderWithEntries(
      [makeEntry({ paymentStatus: PaymentStatus.PENDING })],
      setError
    );

    await act(async () => {
      await result.current.actions.handleCompEntry('entry-1', 'Judge error');
    });

    expect(setError).toHaveBeenCalledWith('Failed to comp entry');
  });

  it('shows the status the server restored on undo, not an assumed pending', async () => {
    vi.mocked(uncompEntry).mockResolvedValue(
      fromAny({ data: { id: 'entry-1', payment_status: 'waived' }, error: null })
    );
    const { result } = renderWithEntries([
      makeEntry({ comped: true, compedReason: 'Judge error', paymentStatus: PaymentStatus.WAIVED }),
    ]);

    await act(async () => {
      await result.current.actions.handleUncompEntry('entry-1');
    });

    const row = result.current.entries.find(entry => entry.id === 'entry-1');
    expect(row?.comped).toBe(false);
    expect(row?.paymentStatus).toBe(PaymentStatus.WAIVED);
  });
});
