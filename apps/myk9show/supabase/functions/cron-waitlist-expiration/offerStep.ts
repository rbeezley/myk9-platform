/**
 * The cron's offer step (MYK9-1003).
 *
 * list_waitlist_offer_candidates() names the first waiting row of each class
 * the cron may try (switch on, trial not past, no open offer). It only reads.
 * Each candidate is then offered by its own promote_waitlist_entry_from_cron
 * call, which is its own transaction and re-checks every rule under the class
 * lock: the show's automatic-offer switch, one open offer per class, first in
 * line, mail-in rows left to the secretary, a trial not past, and a free class
 * and judge-day seat. Mail-in heads get a deduped secretary action notice;
 * online offers tell the secretary and send the exhibitor's
 * in-app message.
 *
 * One transaction per class is deliberate. A single call that offered several
 * classes would hold each offered class's judge-day lock until it finished,
 * and a secretary offering another class on the same judge-day at that moment
 * deadlocks with it (Codex on #2747).
 *
 * It runs after the expiry step in the same run: an offer that expired a
 * moment ago has already closed its checkout session and freed its seat, so
 * the next dog is offered now rather than on the next 15-minute tick.
 */

export interface OfferCandidate {
  class_id: string;
  waitlist_entry_id: string;
  joined_via: string | null;
}

interface RpcResult<T> {
  data: T | null;
  error: { message: string } | null;
}

export interface OfferStepClient {
  rpc(fn: 'list_waitlist_offer_candidates'): PromiseLike<RpcResult<OfferCandidate[]>>;
  rpc(
    fn: 'notify_mail_in_waitlist_head',
    args: { p_waitlist_entry_id: string }
  ): PromiseLike<RpcResult<string>>;
  rpc(
    fn: 'promote_waitlist_entry_from_cron',
    args: { p_waitlist_entry_id: string }
  ): PromiseLike<RpcResult<string>>;
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
  const { data: candidates, error } = await supabase.rpc('list_waitlist_offer_candidates');
  if (error) {
    results.errors.push(`Offer step: ${error.message}`);
    return;
  }

  for (const candidate of candidates ?? []) {
    if (candidate.joined_via === 'mail_in') {
      // The first dog in line joined by mail; the secretary offers it by hand.
      results.skippedMailInOffers++;
      try {
        const { error: noticeError } = await supabase.rpc('notify_mail_in_waitlist_head', {
          p_waitlist_entry_id: candidate.waitlist_entry_id,
        });
        if (noticeError) {
          results.errors.push(
            `Mail-in notice ${candidate.waitlist_entry_id}: ${noticeError.message}`
          );
        }
      } catch (err) {
        results.errors.push(
          `Mail-in notice ${candidate.waitlist_entry_id}: ${err instanceof Error ? err.message : 'Unknown error'}`
        );
      }
      continue;
    }

    const label = `Offer ${candidate.waitlist_entry_id} (class ${candidate.class_id})`;
    try {
      const { data: promotedEntryId, error: promoteError } = await supabase.rpc(
        'promote_waitlist_entry_from_cron',
        { p_waitlist_entry_id: candidate.waitlist_entry_id }
      );
      if (promoteError) {
        results.errors.push(`${label}: ${promoteError.message}`);
        continue;
      }
      // NULL means the class re-checked and must not be offered now (full,
      // an offer appeared, the switch was turned off): not an error.
      if (promotedEntryId) {
        results.newOffers++;
        console.log(`${label}: offered`);
      }
    } catch (err) {
      results.errors.push(`${label}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }
}
