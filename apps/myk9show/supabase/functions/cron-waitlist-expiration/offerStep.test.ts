// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { runWaitlistOfferStep, type OfferStepClient, type OfferStepRow } from './offerStep';

function client(result: { data: OfferStepRow[] | null; error: { message: string } | null }) {
  const rpc = vi.fn(async () => result);
  return { rpc, supabase: { rpc } as OfferStepClient };
}

function emptyResults() {
  return { newOffers: 0, skippedMailInOffers: 0, errors: [] as string[] };
}

describe('waitlist cron offer step (MYK9-1003)', () => {
  it('makes every offer through the one guarded database call, with no arguments', async () => {
    const { rpc, supabase } = client({ data: [], error: null });
    await runWaitlistOfferStep(supabase, emptyResults());
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('offer_waitlist_spots_from_cron');
  });

  it('counts offers and mail-in first dogs, and reports a failed class as an error', async () => {
    const { supabase } = client({
      data: [
        { class_id: 'c1', waitlist_entry_id: 'w1', outcome: 'offered', detail: null },
        { class_id: 'c2', waitlist_entry_id: 'w2', outcome: 'offered', detail: null },
        { class_id: 'c3', waitlist_entry_id: 'w3', outcome: 'mail_in', detail: null },
        { class_id: 'c4', waitlist_entry_id: 'w4', outcome: 'error', detail: 'boom' },
      ],
      error: null,
    });
    const results = emptyResults();
    await runWaitlistOfferStep(supabase, results);
    expect(results).toEqual({
      newOffers: 2,
      skippedMailInOffers: 1,
      errors: ['Offer w4 (class c4): boom'],
    });
  });

  it('turns a failed call into a cron error, so the run is reported as failed', async () => {
    const { supabase } = client({ data: null, error: { message: 'database unavailable' } });
    const results = emptyResults();
    await runWaitlistOfferStep(supabase, results);
    expect(results.errors).toEqual(['Offer step: database unavailable']);
    expect(results.newOffers).toBe(0);
  });
});
