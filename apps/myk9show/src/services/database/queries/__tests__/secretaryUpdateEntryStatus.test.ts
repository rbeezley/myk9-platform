/**
 * Regression: updateEntryStatus and bulkUpdateEntryStatus must pass the
 * caller-supplied EntryStatus through to Supabase verbatim, on the
 * `entry_status` column. Compile-time typing prevents invalid enum values
 * from reaching these functions; these tests lock the runtime wiring.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateEntryStatus, bulkUpdateEntryStatus } from '../../entries/secretary';

const mockFrom = vi.fn();

vi.mock('../../supabaseClient', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
  logQuery: vi.fn(),
  createDatabaseError: (err: unknown) => (err instanceof Error ? err : new Error(String(err))),
}));

function chainMock(overrides: Record<string, unknown> = {}) {
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    ...overrides,
  };
  for (const [key, val] of Object.entries(chain)) {
    if (typeof val === 'function' && !(key in overrides)) {
      (chain[key] as ReturnType<typeof vi.fn>).mockReturnValue(chain);
    }
  }
  return chain;
}

describe('secretaryEntryQueries — entry_status updates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('updateEntryStatus', () => {
    it('writes entry_status = "confirmed" on the matching entry row', async () => {
      const chain = chainMock({
        single: vi.fn().mockResolvedValue({ data: { id: 'e1' }, error: null }),
      });
      mockFrom.mockReturnValue(chain);

      await updateEntryStatus('entry-1', 'confirmed');

      expect(mockFrom).toHaveBeenCalledWith('entries');
      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({ entry_status: 'confirmed' })
      );
      expect(chain.eq).toHaveBeenCalledWith('id', 'entry-1');
    });

    it('writes entry_status = "withdrawn" when caller passes withdrawn', async () => {
      const chain = chainMock({
        single: vi.fn().mockResolvedValue({ data: { id: 'e1' }, error: null }),
      });
      mockFrom.mockReturnValue(chain);

      await updateEntryStatus('entry-1', 'withdrawn');

      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({ entry_status: 'withdrawn' })
      );
    });

    it('sets updated_at on every write', async () => {
      const chain = chainMock({
        single: vi.fn().mockResolvedValue({ data: { id: 'e1' }, error: null }),
      });
      mockFrom.mockReturnValue(chain);

      await updateEntryStatus('entry-1', 'submitted');

      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({ updated_at: expect.any(String) })
      );
    });
  });

  describe('bulkUpdateEntryStatus', () => {
    it('applies entry_status across multiple ids via .in("id", ids)', async () => {
      const chain = chainMock({
        select: vi.fn().mockResolvedValue({ data: [{ id: 'e1' }, { id: 'e2' }], error: null }),
      });
      mockFrom.mockReturnValue(chain);

      await bulkUpdateEntryStatus(['e1', 'e2', 'e3'], 'confirmed');

      expect(mockFrom).toHaveBeenCalledWith('entries');
      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({ entry_status: 'confirmed' })
      );
      expect(chain.in).toHaveBeenCalledWith('id', ['e1', 'e2', 'e3']);
    });
  });
});
