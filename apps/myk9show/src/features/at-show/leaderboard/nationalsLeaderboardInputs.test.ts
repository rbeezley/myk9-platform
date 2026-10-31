import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  range: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { rpc: mocks.rpc },
}));

import {
  fetchNationalsLeaderboardInputs,
  type NationalsLeaderboardInputRow,
} from './nationalsLeaderboardInputs';

const rows = (count: number, offset = 0) =>
  Array.from(
    { length: count },
    (_, i) => ({ entry_id: `e${offset + i}` }) as NationalsLeaderboardInputRow
  );

beforeEach(() => {
  mocks.range.mockReset();
  mocks.rpc.mockReset().mockReturnValue({ range: mocks.range });
});

describe('fetchNationalsLeaderboardInputs', () => {
  it('pages past the 1,000-row cap until a short page proves the field is complete', async () => {
    mocks.range
      .mockResolvedValueOnce({ data: rows(1000), error: null })
      .mockResolvedValueOnce({ data: rows(1000, 1000), error: null })
      .mockResolvedValueOnce({ data: rows(250, 2000), error: null });
    const all = await fetchNationalsLeaderboardInputs('show-1');
    expect(all).toHaveLength(2250);
    expect(mocks.range.mock.calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
    expect(mocks.rpc).toHaveBeenCalledWith('get_nationals_leaderboard_inputs', {
      p_show_id: 'show-1',
    });
  });

  it('asks for another page when the last one is exactly full', async () => {
    mocks.range
      .mockResolvedValueOnce({ data: rows(1000), error: null })
      .mockResolvedValueOnce({ data: [], error: null });
    expect(await fetchNationalsLeaderboardInputs('show-1')).toHaveLength(1000);
    expect(mocks.range).toHaveBeenCalledTimes(2);
  });

  it('fails the whole read when any page fails, never returning a partial field', async () => {
    mocks.range
      .mockResolvedValueOnce({ data: rows(1000), error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    await expect(fetchNationalsLeaderboardInputs('show-1')).rejects.toThrow('boom');
  });
});
