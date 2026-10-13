import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { updateUser } from '@/services/database/users';
import { mockSupabase, resetMockSupabase } from '@/test/mocks/supabase';
import {
  PERSON_EDIT_NEEDS_CONNECTION_CODE,
  PERSON_EDIT_NEEDS_CONNECTION_MESSAGE,
} from '@/utils/signInEmailMessages';

/**
 * MYK9-1090 (plan-offline-record-edits §5): editing an existing person is
 * online-only. Offline, `updateUser` refuses at once with a coded error instead
 * of sending a request that fails as a generic network error.
 */
describe('updateUser connectivity (MYK9-1090)', () => {
  beforeEach(() => {
    mockSupabase.rpc.mockReset();
    resetMockSupabase();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('offline, refuses with PERSON_EDIT_NEEDS_CONNECTION and sends nothing', async () => {
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);

    const result = await updateUser('person-1', { first_name: 'Pat', phone: '555' });

    expect(result.data).toBeNull();
    expect(result.error).toMatchObject({
      code: PERSON_EDIT_NEEDS_CONNECTION_CODE,
      message: PERSON_EDIT_NEEDS_CONNECTION_MESSAGE,
    });
    expect(mockSupabase.rpc).not.toHaveBeenCalled();
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it('online, saves through update_person_details as before', async () => {
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(true);
    mockSupabase.rpc.mockResolvedValue({ data: { id: 'person-1' }, error: null } as never);

    const result = await updateUser('person-1', { first_name: 'Pat', phone: '555' });

    expect(result.error).toBeNull();
    expect(mockSupabase.rpc).toHaveBeenCalledWith('update_person_details', {
      p_person_id: 'person-1',
      p_people: { first_name: 'Pat', phone: '555' },
      p_private: {},
      p_require_unlinked: false,
    });
  });
});
