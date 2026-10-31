import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  result: { data: [{ id: 'n1' }] as unknown[] | null, error: null as Error | null },
  update: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
}));

vi.mock('../supabaseClient', () => ({
  supabase: {
    from: () => ({
      update: (patch: unknown) => {
        h.update(patch);
        return {
          eq: (col: string, val: string) => {
            h.eq(col, val);
            return {
              select: (cols: string) => {
                h.select(cols);
                return Promise.resolve(h.result);
              },
            };
          },
        };
      },
    }),
  },
}));

import { NOTE_CHANGE_REFUSED, deleteEntryFormNote, updateEntryFormNote } from './index';

describe('entry form note writes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.result = { data: [{ id: 'n1' }], error: null };
  });

  it('updates the trimmed body and asks for the row back', async () => {
    await updateEntryFormNote('n1', '  hello  ');
    expect(h.update).toHaveBeenCalledWith({ body: 'hello' });
    expect(h.eq).toHaveBeenCalledWith('id', 'n1');
    expect(h.select).toHaveBeenCalledWith('id');
  });

  it('treats zero affected rows as a refusal, not a success', async () => {
    h.result = { data: [], error: null };
    await expect(updateEntryFormNote('n1', 'x')).rejects.toThrow(NOTE_CHANGE_REFUSED);
    await expect(deleteEntryFormNote('n1')).rejects.toThrow('You can no longer change this note.');
  });

  it('soft deletes by setting deleted_at', async () => {
    await deleteEntryFormNote('n1');
    expect(h.update).toHaveBeenCalledWith({ deleted_at: expect.any(String) });
  });

  it('rethrows a database error', async () => {
    h.result = { data: null, error: new Error('boom') };
    await expect(deleteEntryFormNote('n1')).rejects.toThrow('boom');
  });
});
