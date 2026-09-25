import { act, renderHook } from '@/test/utils/testUtils';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEntryManagementActions } from '../useEntryManagementActions';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { compEntry, uncompEntry } from '@/services/database/entries';
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
    paidAmount: 0,
    entryStatus: EntryStatus.PENDING,
    paymentStatus: PaymentStatus.PENDING,
    submittedAt: new Date('2026-05-08T12:00:00Z'),
    lastUpdated: new Date('2026-05-08T12:00:00Z'),
    ...overrides,
  };
}

/** Real list state, so the assertion reads what the page would render. */
function renderWithEntries(initial: EntryManagementEntry[]) {
  return renderHook(() => {
    const [entries, setEntries] = useState(initial);
    const actions = useEntryManagementActions({
      entries,
      setEntries,
      selectedShowId: 'show-1',
      selectedShow: null,
      showTimeZone: 'America/Chicago',
      setError: vi.fn(),
      user: { id: 'secretary-1' },
    } as unknown as ActionProps);
    return { entries, actions };
  });
}

// MYK9-749 (#2346 review): a move-up destination mirrors its money root's
// comp and payment status. Comping or uncomping through it must update the
// destination row the secretary is looking at, not only the superseded source.
describe('useEntryManagementActions comp on a move-up', () => {
  const source = makeEntry({ id: 'source-1', moneyRootEntryId: 'source-1' });
  const destination = makeEntry({ id: 'destination-1', totalFee: 0, moneyRootEntryId: 'source-1' });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(compEntry).mockResolvedValue(fromAny({ data: null, error: null }));
    vi.mocked(uncompEntry).mockResolvedValue(fromAny({ data: null, error: null }));
  });

  it('marks the displayed destination comped along with its money root', async () => {
    const { result } = renderWithEntries([source, destination]);

    await act(async () => {
      await result.current.actions.handleCompEntry('destination-1', 'Judge error');
    });

    const shown = result.current.entries.find(entry => entry.id === 'destination-1');
    expect(shown).toMatchObject({ comped: true, compedReason: 'Judge error' });
    expect(shown?.paymentStatus).toBe('waived');
  });

  it('clears the comp on the displayed destination too', async () => {
    const comped = { comped: true, compedReason: 'Judge error' };
    const { result } = renderWithEntries([
      { ...source, ...comped },
      { ...destination, ...comped },
    ]);

    await act(async () => {
      await result.current.actions.handleUncompEntry('destination-1');
    });

    const shown = result.current.entries.find(entry => entry.id === 'destination-1');
    expect(shown?.comped).toBe(false);
    expect(shown?.compedReason).toBeUndefined();
    expect(shown?.paymentStatus).toBe(PaymentStatus.PENDING);
  });
});
