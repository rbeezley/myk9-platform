// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());

import { createDatabaseError } from '../databaseError';

vi.mock('../supabaseClient', () => ({ supabase: { rpc }, logQuery: vi.fn(), createDatabaseError }));

import { deleteShow } from './writes';
import { classifyShowDeleteError } from './deleteOutcome';

describe('deleteShow outcome', () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it.each(['Show not found', 'Show not found or already deleted'])(
    'treats the RPC refusal "%s" as already deleted, not a failure',
    async message => {
      rpc.mockResolvedValue({ data: null, error: { message, code: '42501' } });

      const result = await deleteShow('show-1');

      expect(rpc).toHaveBeenCalledWith('soft_delete_show', { p_show_id: 'show-1' });
      expect(result.error).toBeNull();
      expect(result.data).toMatchObject({ id: 'show-1' });
      expect(result).toMatchObject({ alreadyDeleted: true });
    }
  );

  it('still reports Permission denied as an error the caller can name', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Permission denied', code: '42501' } });

    const result = await deleteShow('show-1');

    expect(result.data).toBeNull();
    expect(classifyShowDeleteError(result.error)).toBe('permission-denied');
  });

  it('reports any other failure as a plain failure', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'connection reset' } });

    const result = await deleteShow('show-1');

    expect(result.data).toBeNull();
    expect(classifyShowDeleteError(result.error)).toBe('failed');
  });

  it('a successful delete is not marked already deleted', async () => {
    rpc.mockResolvedValue({ data: null, error: null });

    const result = await deleteShow('show-1');

    expect(result.error).toBeNull();
    expect(result).not.toHaveProperty('alreadyDeleted');
  });
});
