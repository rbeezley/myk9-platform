import { createDatabaseError } from '@/services/database/databaseError';
import { getErrorMessage } from '@myk9/core';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { submitShowEntries } from '../../entries';
import { OWNER_ADDRESS_REQUIRED_CODE } from '@/features/registration/ownerAddress';

const mockRpc = vi.fn();

vi.mock('../../supabaseClient', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
  logQuery: vi.fn(),
  createDatabaseError,
}));

const params = {
  showId: 'show-uuid-1',
  registrationId: 'enrollment-uuid-1',
  entries: [
    {
      dogId: 'dog-uuid-1',
      classId: 'class-uuid-1',
      handlerName: 'Pat Owner',
      paymentMethod: 'check',
      clientFeeCents: 3000,
    },
  ],
  submissionId: 'sub-uuid-1',
  paymentMethod: 'check',
  submissionSource: 'organizer' as const,
};

// What PostgREST returns for the RAISE in 20261008183700 (verified against a
// local Postgres run of the function: SQLSTATE 23514, HINT owner_address_required).
const REFUSAL = {
  message:
    "Add the owner's street address and ZIP or postal code to enter Rex in an AKC trial. AKC prints the owner's address in the marked catalog.",
  code: '23514',
  details: null,
  hint: 'owner_address_required',
};

describe('submitShowEntries — owner address refusal (MYK9-1010)', () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it('maps the refusal to the owner_address_required code and keeps the message', async () => {
    mockRpc.mockResolvedValue({ data: null, error: REFUSAL });

    const caught = await submitShowEntries(params).catch((error: unknown) => error);

    expect(caught).toMatchObject({
      name: 'DatabaseError',
      code: OWNER_ADDRESS_REQUIRED_CODE,
      message: REFUSAL.message,
    });
    // `submitPaymentStep` toasts getErrorMessage(error): the sentence names the
    // dog and the missing parts.
    expect(getErrorMessage(caught)).toBe(REFUSAL.message);
  });

  it('leaves another 23514 (the registration-number trigger) on its own code', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: {
        message: 'This dog has no AKC registration number. A registration number is required to enter.',
        code: '23514',
        details: null,
        hint: null,
      },
    });

    await expect(submitShowEntries(params)).rejects.toMatchObject({ code: '23514' });
  });
});
