/**
 * Regression tests: entry_status enum values written/read by the query layer
 *
 * The CHECK constraint on entries.entry_status (see migration 139) only allows
 * the 19 canonical values defined in `types/entry-lifecycle.ts`. Before this
 * suite existed, several queries used legacy values ('accepted', 'checked_in',
 * 'pending', 'waitlisted') that silently returned empty sets on reads and
 * failed the CHECK on writes. These tests assert each query passes the correct
 * canonical values to Supabase.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getMoveUpEligibleEntries, denyMoveUpRequest } from '../moveUpQueries';
import {
  getScratchableEntries,
  scratchEntry,
  requestScratch,
  approveScratchRequest,
  denyScratchRequest,
} from '../scratchQueries';
import { getEntryCountsByStatus } from '../secretaryEntryQueries';
import { autoAssignArmbands } from '../secretaryArmbandQueries';

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
    is: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    ...overrides,
  };
  for (const [key, val] of Object.entries(chain)) {
    if (typeof val === 'function' && !(key in overrides)) {
      (chain[key] as ReturnType<typeof vi.fn>).mockReturnValue(chain);
    }
  }
  return chain;
}

describe('entry_status enum values used by query layer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('moveUpQueries', () => {
    it('getMoveUpEligibleEntries filters by ["confirmed", "checked-in"]', async () => {
      const chain = chainMock({
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      });
      mockFrom.mockReturnValue(chain);

      await getMoveUpEligibleEntries('show-1');

      expect(chain.in).toHaveBeenCalledWith('entry_status', ['confirmed', 'checked-in']);
      // Regression guard: never the legacy values
      expect(chain.in).not.toHaveBeenCalledWith(
        'entry_status',
        expect.arrayContaining(['accepted'])
      );
      expect(chain.in).not.toHaveBeenCalledWith(
        'entry_status',
        expect.arrayContaining(['checked_in'])
      );
    });

    it('denyMoveUpRequest reverts status to "confirmed" and matches "move-up-requested"', async () => {
      const chain = chainMock({
        single: vi.fn().mockResolvedValue({ data: { id: 'e1' }, error: null }),
      });
      mockFrom.mockReturnValue(chain);

      await denyMoveUpRequest('entry-1', 'not eligible');

      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({ entry_status: 'confirmed' })
      );
      expect(chain.eq).toHaveBeenCalledWith('entry_status', 'move-up-requested');
    });
  });

  describe('scratchQueries', () => {
    it('getScratchableEntries filters by ["confirmed", "checked-in"]', async () => {
      const chain = chainMock({
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      });
      mockFrom.mockReturnValue(chain);

      await getScratchableEntries('show-1');

      expect(chain.in).toHaveBeenCalledWith('entry_status', ['confirmed', 'checked-in']);
    });

    it('scratchEntry writes entry_status = "scratched"', async () => {
      const chain = chainMock({
        single: vi.fn().mockResolvedValue({ data: { id: 'e1' }, error: null }),
      });
      mockFrom.mockReturnValue(chain);

      await scratchEntry('entry-1', 'withdrew');

      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({ entry_status: 'scratched' })
      );
    });

    it('requestScratch writes entry_status = "scratch-requested"', async () => {
      const chain = chainMock({
        single: vi.fn().mockResolvedValue({ data: { id: 'e1' }, error: null }),
      });
      mockFrom.mockReturnValue(chain);

      await requestScratch('entry-1', 'sick dog');

      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({ entry_status: 'scratch-requested' })
      );
    });

    it('approveScratchRequest matches "scratch-requested" and writes "scratched"', async () => {
      const chain = chainMock({
        single: vi.fn().mockResolvedValue({ data: { id: 'e1' }, error: null }),
      });
      mockFrom.mockReturnValue(chain);

      await approveScratchRequest('entry-1');

      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({ entry_status: 'scratched' })
      );
      expect(chain.eq).toHaveBeenCalledWith('entry_status', 'scratch-requested');
    });

    it('denyScratchRequest reverts to "confirmed"', async () => {
      const chain = chainMock({
        single: vi.fn().mockResolvedValue({ data: { id: 'e1' }, error: null }),
      });
      mockFrom.mockReturnValue(chain);

      await denyScratchRequest('entry-1');

      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({ entry_status: 'confirmed' })
      );
    });
  });

  describe('secretaryEntryQueries', () => {
    it('autoAssignArmbands selects entries with entry_status in ["accepted", "confirmed"]', async () => {
      const chain = chainMock({
        is: vi.fn().mockResolvedValue({ data: [], error: null }),
      });
      mockFrom.mockReturnValue(chain);

      await autoAssignArmbands('show-1');

      expect(chain.in).toHaveBeenCalledWith('entry_status', ['accepted', 'confirmed']);
      // Regression guard: never filter to only one status
      expect(chain.eq).not.toHaveBeenCalledWith('entry_status', 'confirmed');
      expect(chain.eq).not.toHaveBeenCalledWith('entry_status', 'accepted');
    });

    it('getEntryCountsByStatus counts submitted/confirmed/pending-payment', async () => {
      const rows = [
        { entry_status: 'submitted', payment_status: 'pending' },
        { entry_status: 'confirmed', payment_status: 'paid' },
        { entry_status: 'confirmed', payment_status: 'paid' },
        { entry_status: 'pending-payment', payment_status: 'pending' },
      ];
      const chain = chainMock({
        is: vi.fn().mockResolvedValue({ data: rows, error: null }),
      });
      mockFrom.mockReturnValue(chain);

      const { data } = await getEntryCountsByStatus('show-1');

      expect(data).toEqual({
        total: 4,
        submitted: 1,
        confirmed: 2,
        pendingPayment: 1,
        paymentDue: 2,
      });
    });
  });
});
