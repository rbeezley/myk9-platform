import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabaseError } from '@/services/database/databaseError';
import { PERSON_EDIT_NEEDS_CONNECTION_CODE } from '@/utils/signInEmailMessages';
import { setJudgeAffiliation } from './setJudgeAffiliation';

const rpc = vi.hoisted(() => vi.fn());

vi.mock('../supabaseClient', () => ({
  supabase: { rpc },
  createDatabaseError,
}));

describe('setJudgeAffiliation (MYK9-2294)', () => {
  beforeEach(() => {
    rpc.mockReset();
    rpc.mockResolvedValue({ error: null });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls the single-field RPC with the person, the show and the text', async () => {
    await setJudgeAffiliation('person-1', 'show-1', 'Region 4');
    expect(rpc).toHaveBeenCalledWith('set_judge_affiliation', {
      p_person_id: 'person-1',
      p_show_id: 'show-1',
      p_affiliation: 'Region 4',
    });
  });

  it('refuses offline with the person-edit reconnect code instead of calling the server', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await expect(setJudgeAffiliation('person-1', 'show-1', 'Region 4')).rejects.toMatchObject({
      code: PERSON_EDIT_NEEDS_CONNECTION_CODE,
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});
