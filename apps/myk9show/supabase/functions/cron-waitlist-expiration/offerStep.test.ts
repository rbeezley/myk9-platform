// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { runWaitlistOfferStep, type OfferCandidate, type OfferStepClient } from './offerStep';

type PromoteResult = { data: string | null; error: { message: string } | null } | Error;

function client(
  list: { data: OfferCandidate[] | null; error: { message: string } | null },
  promote: Record<string, PromoteResult> = {}
) {
  const rpc = vi.fn(async (fn: string, args?: { p_waitlist_entry_id: string }) => {
    if (fn === 'list_waitlist_offer_candidates') return list;
    const result = promote[args?.p_waitlist_entry_id ?? ''] ?? { data: null, error: null };
    if (result instanceof Error) throw result;
    return result;
  });
  return { rpc, supabase: { rpc } as unknown as OfferStepClient };
}

function emptyResults() {
  return { newOffers: 0, skippedMailInOffers: 0, errors: [] as string[] };
}

const candidate = (n: number, joinedVia = 'online'): OfferCandidate => ({
  class_id: `c${n}`,
  waitlist_entry_id: `w${n}`,
  joined_via: joinedVia,
});

describe('waitlist cron offer step (MYK9-1003)', () => {
  it('lists candidates, then makes one separate promote call per online candidate', async () => {
    const { rpc, supabase } = client(
      { data: [candidate(1), candidate(2), candidate(3, 'mail_in')], error: null },
      { w1: { data: 'e1', error: null }, w2: { data: 'e2', error: null } }
    );
    const results = emptyResults();
    await runWaitlistOfferStep(supabase, results);

    expect(rpc.mock.calls).toEqual([
      ['list_waitlist_offer_candidates'],
      ['promote_waitlist_entry_from_cron', { p_waitlist_entry_id: 'w1' }],
      ['promote_waitlist_entry_from_cron', { p_waitlist_entry_id: 'w2' }],
    ]);
    expect(results).toEqual({ newOffers: 2, skippedMailInOffers: 1, errors: [] });
  });

  it('a failed class is counted as an error and the others are still offered', async () => {
    const { rpc, supabase } = client(
      { data: [candidate(1), candidate(2), candidate(3), candidate(4)], error: null },
      {
        w1: { data: null, error: { message: 'deadlock detected' } },
        w2: new Error('network down'),
        w3: { data: 'e3', error: null },
        w4: { data: null, error: null },
      }
    );
    const results = emptyResults();
    await runWaitlistOfferStep(supabase, results);

    expect(rpc).toHaveBeenCalledTimes(5);
    expect(results).toEqual({
      newOffers: 1,
      skippedMailInOffers: 0,
      errors: ['Offer w1 (class c1): deadlock detected', 'Offer w2 (class c2): network down'],
    });
  });

  it('a class that re-checks to "not now" (NULL) is neither an offer nor an error', async () => {
    const { supabase } = client(
      { data: [candidate(1)], error: null },
      { w1: { data: null, error: null } }
    );
    const results = emptyResults();
    await runWaitlistOfferStep(supabase, results);
    expect(results).toEqual({ newOffers: 0, skippedMailInOffers: 0, errors: [] });
  });

  it('turns a failed candidate list into a cron error and offers nothing', async () => {
    const { rpc, supabase } = client({ data: null, error: { message: 'database unavailable' } });
    const results = emptyResults();
    await runWaitlistOfferStep(supabase, results);
    expect(results.errors).toEqual(['Offer step: database unavailable']);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
