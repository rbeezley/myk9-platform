import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@/test/utils/testUtils';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { useEntryManagementActions } from '../useEntryManagementActions';

// MYK9-1974: when a single Accept stands, the hook hands the decision over and the send
// server decides whether the entry still has it. The real Undo toast runs here, so "Undo
// sends nothing" is proven through the same close callbacks sonner calls.

const mocks = vi.hoisted(() => ({
  changeSecretaryEntryStatus: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: mocks.toastSuccess, error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));
vi.mock('@/services/secretary/entry-workflow', () => ({
  changeSecretaryEntryStatus: mocks.changeSecretaryEntryStatus,
}));
vi.mock('@/services/AuditService', () => ({ auditService: { log: vi.fn(), logAction: vi.fn() } }));
vi.mock('@/services/LoggingService', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

function entry(overrides: Partial<EntryManagementEntry> = {}): EntryManagementEntry {
  return {
    id: 'entry-1',
    registrationId: 'registration-1',
    entryNumber: '',
    showId: 'show-a',
    dogId: 'dog-1',
    dogName: 'Rex',
    ownerName: 'Pat',
    ownerEmail: 'pat@example.test',
    handlerName: 'Pat',
    classes: [],
    totalFee: 10,
    paidAmount: 0,
    entryStatus: EntryStatus.PENDING,
    paymentStatus: PaymentStatus.PENDING,
    submittedAt: new Date('2026-05-08T12:00:00Z'),
    lastUpdated: new Date('2026-05-08T12:00:00Z'),
    ...overrides,
  };
}

interface ToastOptions {
  action?: { onClick: () => void };
  onAutoClose?: () => void;
  onDismiss?: () => void;
}

async function acceptOnShowA(onStood: (entry: EntryManagementEntry) => void) {
  const view = renderHook(
    ({ list, showId }: { list: EntryManagementEntry[]; showId: string }) =>
      useEntryManagementActions({
        entries: list,
        setEntries: vi.fn(),
        selectedShowId: showId,
        selectedShow: null,
        setError: vi.fn(),
        user: { id: 'secretary-1' },
      }),
    { initialProps: { list: [entry()], showId: 'show-a' } }
  );
  await act(async () => {
    await view.result.current.handleStatusChange('entry-1', EntryStatus.ACCEPTED, undefined, {
      onStood,
    });
  });
  const options = mocks.toastSuccess.mock.calls[0]?.[1] as ToastOptions;
  return { view, options };
}

describe('single status change: the decision stood (MYK9-1974)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.changeSecretaryEntryStatus.mockResolvedValue({});
  });

  it('after a switch to show B, hands over the acceptance once and leaves the status check to the server', async () => {
    const onStood = vi.fn();
    const { view, options } = await acceptOnShowA(onStood);

    view.rerender({ list: [entry({ id: 'b-entry', showId: 'show-b' })], showId: 'show-b' });
    act(() => options.onAutoClose?.());
    act(() => options.onDismiss?.());

    expect(onStood).toHaveBeenCalledTimes(1);
    expect(onStood).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'entry-1',
        showId: 'show-a',
        entryStatus: EntryStatus.ACCEPTED,
      })
    );
  });

  it('does not judge a newer status on the list itself: the server skips a superseded email', async () => {
    const onStood = vi.fn();
    const { view, options } = await acceptOnShowA(onStood);
    const waitlistedSince = entry({ entryStatus: EntryStatus.WAITLIST });

    view.rerender({ list: [waitlistedSince], showId: 'show-a' });
    act(() => options.onAutoClose?.());

    expect(onStood).toHaveBeenCalledTimes(1);
    expect(onStood).toHaveBeenCalledWith(waitlistedSince);
  });

  it('Undo pressed: nothing is handed over, even when the toast then closes', async () => {
    const onStood = vi.fn();
    const { view, options } = await acceptOnShowA(onStood);

    view.rerender({ list: [], showId: 'show-b' });
    act(() => options.action?.onClick());
    act(() => options.onAutoClose?.());
    act(() => options.onDismiss?.());

    expect(onStood).not.toHaveBeenCalled();
  });
});
