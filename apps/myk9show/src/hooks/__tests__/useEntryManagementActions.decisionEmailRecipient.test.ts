import { act, renderHook } from '@/test/utils/testUtils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { useEntryManagementActions } from '../useEntryManagementActions';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    functions: { invoke: mocks.invoke },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
    }),
  },
}));

vi.mock('@/services/LoggingService', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

function entryFor(overrides: Partial<EntryManagementEntry>): EntryManagementEntry {
  return {
    id: 'entry-1',
    registrationId: 'registration-1',
    entryNumber: '',
    showId: 'show-1',
    dogId: 'dog-1',
    dogName: 'Rex',
    ownerName: 'Olive Owner',
    ownerEmail: '',
    handlerName: 'Hank Handler',
    classes: [],
    totalFee: 10,
    paidAmount: 0,
    entryStatus: EntryStatus.ACCEPTED,
    paymentStatus: PaymentStatus.PENDING,
    submittedAt: new Date('2026-05-08T12:00:00Z'),
    lastUpdated: new Date('2026-05-08T12:00:00Z'),
    ...overrides,
  };
}

function send(entry: EntryManagementEntry) {
  const { result } = renderHook(() =>
    useEntryManagementActions({
      entries: [entry],
      setEntries: vi.fn(),
      selectedShowId: 'show-1',
      selectedShow: null,
      setError: vi.fn(),
      user: { id: 'secretary-1' },
    })
  );
  return act(async () => {
    await result.current.handleSendDecisionEmail('registration-1');
  });
}

// MYK9-2483: send-email resolves the recipient from the enrollment's handler, not the dog's owner.
describe('handleSendDecisionEmail recipient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.invoke.mockResolvedValue({ error: null });
  });

  it('sends to the handler address when only the handler has one', async () => {
    await send(entryFor({ ownerEmail: '', enrollmentPayerEmail: 'hank@example.com' }));

    expect(mocks.invoke).toHaveBeenCalledWith(
      'send-email',
      expect.objectContaining({ body: expect.objectContaining({ to: 'hank@example.com' }) })
    );
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('sends nothing when only the owner has an address, because the server mails the handler', async () => {
    await send(entryFor({ ownerEmail: 'olive@example.com', enrollmentPayerEmail: '' }));

    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('No email address on file for this exhibitor.');
  });
});
