import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabaseError } from '@/services/database/databaseError';

const mockRpc = vi.fn();
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
  createDatabaseError,
}));

import { fillEntryOwnerAddress } from './fillEntryOwnerAddress';

const input = {
  showId: 'show-1',
  dogId: 'dog-1',
  streetAddress: '12 Elm St',
  city: '',
  state: '',
  zipCode: '62701',
};

describe('fillEntryOwnerAddress (MYK9-1010)', () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it('calls the show-scoped fill-blanks RPC with the show and the dog', async () => {
    mockRpc.mockResolvedValue({
      data: [{ street_address: '12 Elm St', city: 'Springfield', state: 'IL', zip_code: '62701' }],
      error: null,
    });

    const result = await fillEntryOwnerAddress(input);

    expect(mockRpc).toHaveBeenCalledWith('fill_entry_owner_address', {
      p_show_id: 'show-1',
      p_dog_id: 'dog-1',
      p_street_address: '12 Elm St',
      p_city: '',
      p_state: '',
      p_zip_code: '62701',
    });
    expect(result).toEqual({
      streetAddress: '12 Elm St',
      city: 'Springfield',
      state: 'IL',
      zipCode: '62701',
    });
  });

  it('throws the server refusal with its message and code', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: {
        message: 'Permission denied for show show-1',
        code: '42501',
        details: null,
        hint: null,
      },
    });

    await expect(fillEntryOwnerAddress(input)).rejects.toMatchObject({
      message: 'Permission denied for show show-1',
      code: '42501',
    });
  });
});
