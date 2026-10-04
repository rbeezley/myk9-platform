/**
 * The cron's offer step (MYK9-1003).
 *
 * Every rule about WHO may be offered lives in one database call,
 * offer_waitlist_spots_from_cron(): the show's automatic-offer switch, one
 * open offer per class, first in line only, mail-in rows left to the
 * secretary, and a free class and judge-day seat. It also tells the
 * secretary and sends the exhibitor's in-app message. This module only
 * tallies what the call reports.
 *
 * It runs after the expiry step in the same run: an offer that expired a
 * moment ago has already closed its checkout session and freed its seat, so
 * the next dog is offered now rather than on the next 15-minute tick.
 */

export interface OfferStepRow {
  class_id: string;
  waitlist_entry_id: string;
  outcome: 'offered' | 'mail_in' | 'error' | string;
  detail: string | null;
}

export interface OfferStepClient {
  rpc(
    fn: 'offer_waitlist_spots_from_cron'
  ): PromiseLike<{ data: OfferStepRow[] | null; error: { message: string } | null }>;
}

export interface OfferStepResults {
  newOffers: number;
  skippedMailInOffers: number;
  errors: string[];
}

export async function runWaitlistOfferStep(
  supabase: OfferStepClient,
  results: OfferStepResults
): Promise<void> {
  const { data, error } = await supabase.rpc('offer_waitlist_spots_from_cron');
  if (error) {
    results.errors.push(`Offer step: ${error.message}`);
    return;
  }

  for (const row of data ?? []) {
    if (row.outcome === 'offered') {
      results.newOffers++;
      console.log(`Offered class ${row.class_id} to waitlist row ${row.waitlist_entry_id}`);
    } else if (row.outcome === 'mail_in') {
      // The first dog in line joined by mail; the secretary offers it by hand.
      results.skippedMailInOffers++;
    } else {
      results.errors.push(
        `Offer ${row.waitlist_entry_id} (class ${row.class_id}): ${row.detail ?? row.outcome}`
      );
    }
  }
}
