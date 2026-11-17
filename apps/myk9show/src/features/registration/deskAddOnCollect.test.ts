/**
 * MYK9-2149: the desk reads what to collect from the server, priced as submission prices
 * it, and names its answer.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@/lib/supabase';
import {
  alreadyCoveredLabel,
  collectDifferenceLabel,
  deskAddOnCollect,
  deskExpectedCollectCents,
  fetchDeskAddOnQuote,
} from './deskAddOnCollect';

vi.mock('@/lib/supabase', () => ({ supabase: { rpc: vi.fn() } }));

describe('deskAddOnCollect (MYK9-2149)', () => {
  beforeEach(() => {
    vi.mocked(supabase.rpc).mockReset();
  });

  it('asks the server to price the classes, with the junior choice, for the exhibitor', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: [{ collect_cents: 1000, held_cents: 1000, addon_cents: 2000 }],
      error: null,
    } as never);

    await expect(fetchDeskAddOnQuote('show-1', 'owner-1', ['class-1'], true)).resolves.toEqual({
      collectCents: 1000,
      heldCents: 1000,
      addonCents: 2000,
    });
    expect(supabase.rpc).toHaveBeenCalledWith('desk_addon_amount_to_collect', {
      p_show_id: 'show-1',
      p_handler_id: 'owner-1',
      p_class_ids: ['class-1'],
      p_junior_override: true,
    });
  });

  it('throws on an error, so the step falls back to unchanged', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: null,
      error: { message: 'not authorized' },
    } as never);

    await expect(fetchDeskAddOnQuote('show-1', 'owner-1', ['class-1'], false)).rejects.toBeTruthy();
  });

  it("reads covered, partial and unchanged against the server's own price", () => {
    expect(deskAddOnCollect({ collectCents: 0, heldCents: 4000, addonCents: 3000 })).toEqual({
      kind: 'covered',
      heldCents: 4000,
    });
    expect(deskAddOnCollect({ collectCents: 1000, heldCents: 1000, addonCents: 2000 })).toEqual({
      kind: 'partial',
      collectCents: 1000,
      heldCents: 1000,
    });
    expect(deskAddOnCollect({ collectCents: 3000, heldCents: 0, addonCents: 3000 })).toEqual({
      kind: 'unchanged',
      collectCents: 3000,
    });
    expect(deskAddOnCollect(undefined)).toEqual({ kind: 'unchanged' });
  });

  it('sends the quoted amount as the ceiling, and none without a quote', () => {
    expect(deskExpectedCollectCents({ kind: 'partial', collectCents: 1000, heldCents: 1000 })).toBe(
      1000
    );
    expect(deskExpectedCollectCents({ kind: 'unchanged', collectCents: 3000 })).toBe(3000);
    expect(deskExpectedCollectCents({ kind: 'covered', heldCents: 4000 })).toBe(0);
    expect(deskExpectedCollectCents({ kind: 'unchanged' })).toBeNull();
  });

  it('words the two answers without dashes', () => {
    expect(alreadyCoveredLabel(4000)).toBe('Already covered ($40.00 on this form)');
    expect(collectDifferenceLabel(2000, 1000)).toBe('Collect $20.00 ($10.00 already on this form)');
  });
});
