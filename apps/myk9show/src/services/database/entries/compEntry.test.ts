/**
 * MYK9-1407: the comp writes never send payment_status. The database trigger
 * owns it (refuses a comp on a paid or refunded entry with SQLSTATE MKCMP,
 * restores the pre-comp status on undo), so a client-sent value could only
 * overwrite the server's decision.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabaseError } from '@/services/database/databaseError';

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  single: vi.fn(),
}));

vi.mock('../supabaseClient', () => ({
  createDatabaseError,
  logQuery: vi.fn(),
  supabase: { from: vi.fn(() => ({ update: mocks.update })) },
}));

import { COMP_REFUSED_PAID_CODE, compEntry, uncompEntry } from './compEntry';

describe('compEntry / uncompEntry (MYK9-1407)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.update.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ single: mocks.single });
  });

  it('comps without writing payment_status', async () => {
    mocks.single.mockResolvedValue({
      data: { id: 'entry-1', payment_status: 'waived' },
      error: null,
    });

    const result = await compEntry({ entryId: 'entry-1', reason: 'Judge error' });

    expect(mocks.update).toHaveBeenCalledWith({
      comped: true,
      comped_reason: 'Judge error',
      updated_at: expect.any(String),
    });
    expect(mocks.eq).toHaveBeenCalledWith('id', 'entry-1');
    expect(result.error).toBeNull();
  });

  it('uncomps without writing payment_status and returns the status the server restored', async () => {
    mocks.single.mockResolvedValue({
      data: { id: 'entry-1', payment_status: 'waived' },
      error: null,
    });

    const result = await uncompEntry('entry-1');

    expect(mocks.update).toHaveBeenCalledWith({
      comped: false,
      comped_reason: null,
      updated_at: expect.any(String),
    });
    expect(result.data).toMatchObject({ payment_status: 'waived' });
  });

  it('surfaces the server refusal of a comp on a paid entry with its code', async () => {
    mocks.single.mockResolvedValue({
      data: null,
      error: { code: 'MKCMP', message: 'comp_refused_paid_entry' },
    });

    const result = await compEntry({ entryId: 'entry-1', reason: 'Judge error' });

    expect(result.data).toBeNull();
    expect(result.error?.code).toBe(COMP_REFUSED_PAID_CODE);
  });
});
