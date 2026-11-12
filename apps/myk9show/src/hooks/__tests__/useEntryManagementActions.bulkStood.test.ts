import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@/test/utils/testUtils';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { useEntryManagementActions } from '../useEntryManagementActions';

const mocks = vi.hoisted(() => ({
  changeSecretaryEntryStatus: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: mocks.toastSuccess,
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));
vi.mock('@/services/secretary/entry-workflow', () => ({
  changeSecretaryEntryStatus: mocks.changeSecretaryEntryStatus,
}));
vi.mock('@/services/AuditService', () => ({ auditService: { log: vi.fn(), logAction: vi.fn() } }));
vi.mock('@/services/LoggingService', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

function entry(id: string, overrides: Partial<EntryManagementEntry> = {}): EntryManagementEntry {
  return {
    id,
    registrationId: 'registration-1',
    entryNumber: '',
    showId: 'show-1',
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

function useActions(entries: EntryManagementEntry[]) {
  return useEntryManagementActions({
    entries,
    setEntries: vi.fn(),
    selectedShowId: 'show-1',
    selectedShow: null,
    setError: vi.fn(),
    user: { id: 'secretary-1' },
  });
}

async function acceptAll(
  entries: EntryManagementEntry[],
  onStood: (entries: EntryManagementEntry[]) => void
) {
  const view = renderHook(({ list }) => useActions(list), { initialProps: { list: entries } });
  await act(async () => {
    await view.result.current.handleEnrollmentBulkStatusChange(
      entries.map(e => e.id),
      EntryStatus.ACCEPTED,
      undefined,
      { onStood }
    );
  });
  const options = mocks.toastSuccess.mock.calls[0]?.[1] as ToastOptions;
  return { view, options };
}

describe('bulk status change: the decision stood (MYK9-1800)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.changeSecretaryEntryStatus.mockResolvedValue({});
  });

  it('hands over every accepted entry, once, when the toast closes without Undo', async () => {
    const onStood = vi.fn();
    const list = [entry('e1'), entry('e2'), entry('e3')];
    const { view, options } = await acceptAll(list, onStood);

    expect(onStood).not.toHaveBeenCalled();
    // The page's list has taken the change by the time the toast closes.
    view.rerender({ list: list.map(e => ({ ...e, entryStatus: EntryStatus.ACCEPTED })) });
    act(() => options.onAutoClose?.());
    act(() => options.onDismiss?.());

    expect(onStood).toHaveBeenCalledTimes(1);
    expect(onStood.mock.calls[0]?.[0].map((e: EntryManagementEntry) => e.id)).toEqual([
      'e1',
      'e2',
      'e3',
    ]);
  });

  it('Undo pressed: nothing stands, even if the toast then closes', async () => {
    const onStood = vi.fn();
    const { options } = await acceptAll([entry('e1'), entry('e2')], onStood);

    act(() => options.action?.onClick());
    act(() => options.onDismiss?.());

    expect(onStood).not.toHaveBeenCalled();
  });

  it('skips an entry whose status changed again inside the window', async () => {
    const onStood = vi.fn();
    const list = [entry('e1'), entry('e2')];
    const { view, options } = await acceptAll(list, onStood);

    // The page's list now shows e1 accepted and e2 rejected by a later change.
    view.rerender({
      list: [
        entry('e1', { entryStatus: EntryStatus.ACCEPTED, armbandNumber: '742' }),
        entry('e2', { entryStatus: EntryStatus.REJECTED }),
      ],
    });
    act(() => options.onAutoClose?.());

    expect(onStood).toHaveBeenCalledTimes(1);
    expect(onStood.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({ id: 'e1', armbandNumber: '742' }),
    ]);
  });

  it('after a show switch inside the window, still stands from what was decided', async () => {
    const onStood = vi.fn();
    const { view, options } = await acceptAll([entry('e1'), entry('e2')], onStood);

    view.rerender({ list: [] });
    act(() => options.onAutoClose?.());

    expect(onStood).toHaveBeenCalledTimes(1);
    expect(onStood.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({ id: 'e1', entryStatus: EntryStatus.ACCEPTED }),
      expect.objectContaining({ id: 'e2', entryStatus: EntryStatus.ACCEPTED }),
    ]);
  });

  it('a caller that passes no onStood gets the same toast it always did', async () => {
    const view = renderHook(() => useActions([entry('e1')]));
    await act(async () => {
      await view.result.current.handleEnrollmentBulkStatusChange(['e1'], EntryStatus.ACCEPTED);
    });

    const options = mocks.toastSuccess.mock.calls[0]?.[1] as ToastOptions;
    expect(options.onAutoClose).toBeUndefined();
    expect(options.action).toBeDefined();
  });
});
