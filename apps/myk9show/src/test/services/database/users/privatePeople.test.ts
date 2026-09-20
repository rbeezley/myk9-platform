import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadPeoplePrivateProfiles } from '@/services/database/users/privatePeople';
import { mockSupabase, resetMockSupabase } from '@/test/mocks/supabase';

const UNAVAILABLE_KEY = 'myk9:people-private-rpc-unavailable';

describe('loadPeoplePrivateProfiles', () => {
  beforeEach(() => {
    resetMockSupabase();
    window.sessionStorage.removeItem(UNAVAILABLE_KEY);
  });

  afterEach(() => {
    window.sessionStorage.removeItem(UNAVAILABLE_KEY);
  });

  it('fails closed and suppresses repeated probes while the expand migration is absent', async () => {
    mockSupabase.rpc.mockResolvedValue({
      data: null,
      error: {
        code: 'PGRST202',
        message: 'Could not find the function public.get_people_private in the schema cache',
        status: 404,
      },
    });

    const first = await loadPeoplePrivateProfiles(['person-1']);
    const second = await loadPeoplePrivateProfiles(['person-2']);

    expect(mockSupabase.rpc).toHaveBeenCalledTimes(1);
    expect(first.byPersonId).toEqual(new Map());
    expect(first.readComplete).toBe(false);
    expect(first.readError).toContain('migration is applied');
    expect(second.byPersonId).toEqual(new Map());
    expect(second.readComplete).toBe(false);
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it('does not mark a successful RPC read as unavailable', async () => {
    mockSupabase.rpc.mockResolvedValue({
      data: [{ person_id: 'person-1', date_of_birth: null, junior_handler_numbers: {} }],
      error: null,
    });

    const result = await loadPeoplePrivateProfiles(['person-1']);

    expect(result.readComplete).toBe(true);
    expect(result.byPersonId.has('person-1')).toBe(true);
    expect(window.sessionStorage.getItem(UNAVAILABLE_KEY)).toBeNull();
  });
});
