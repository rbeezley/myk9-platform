import { supabase } from '@/lib/supabase';
import { formatCartCurrency } from '@/store/cartStore.helpers';

/**
 * MYK9-2149: what the desk should collect for the classes being added to an exhibitor's
 * form, and what that form already holds beyond what it owes. Every figure is the
 * server's (`desk_addon_amount_to_collect`): it prices the add-on exactly as
 * `submit_show_entries` will (the one pricing function, the day-of rule and the junior
 * handler fee override) and reads the same due the submission cap uses (MYK9-1966), so
 * the step never tells the secretary to take an amount the server will not record. There
 * is no client money formula here: this module only names the server's answer.
 *
 * Online-only desk path (a direct RPC, as checkout and other desk money reads are). Offline
 * or on any error the caller keeps today's behaviour and claims nothing is covered.
 */
export interface DeskAddOnQuote {
  collectCents: number;
  heldCents: number;
  /** The add-on as the server prices it. */
  addonCents: number;
}

export type DeskAddOnCollect =
  /** The form's held money pays for the whole add-on: nothing to collect. */
  | { kind: 'covered'; heldCents: number }
  /** The form's held money pays part of it: collect only the difference. */
  | { kind: 'partial'; collectCents: number; heldCents: number }
  /**
   * Nothing held, no answer, or nothing to price: the payment step as it always was.
   * `collectCents` is the server's quote when there was one.
   */
  | { kind: 'unchanged'; collectCents?: number | undefined };

const UNCHANGED: DeskAddOnCollect = { kind: 'unchanged' };

export async function fetchDeskAddOnQuote(
  showId: string,
  handlerId: string,
  classIds: readonly string[],
  juniorOverride: boolean
): Promise<DeskAddOnQuote> {
  const { data, error } = await supabase.rpc(
    'desk_addon_amount_to_collect' as never,
    {
      p_show_id: showId,
      p_handler_id: handlerId,
      p_class_ids: classIds,
      p_junior_override: juniorOverride,
    } as never
  );
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as
    { collect_cents?: unknown; held_cents?: unknown; addon_cents?: unknown } | null | undefined;
  const collectCents = Number(row?.collect_cents);
  const heldCents = Number(row?.held_cents);
  const addonCents = Number(row?.addon_cents);
  if (![collectCents, heldCents, addonCents].every(Number.isFinite)) {
    throw new Error('desk_addon_amount_to_collect returned no amount');
  }
  return { collectCents, heldCents, addonCents };
}

/** Which payment step the server's answer calls for. No answer is `unchanged`. */
export function deskAddOnCollect(quote: DeskAddOnQuote | null | undefined): DeskAddOnCollect {
  if (!quote) return UNCHANGED;
  if (quote.addonCents <= 0 || quote.heldCents <= 0) {
    return { kind: 'unchanged', collectCents: quote.collectCents };
  }
  if (quote.collectCents <= 0) return { kind: 'covered', heldCents: quote.heldCents };
  if (quote.collectCents < quote.addonCents) {
    return { kind: 'partial', collectCents: quote.collectCents, heldCents: quote.heldCents };
  }
  return { kind: 'unchanged', collectCents: quote.collectCents };
}

/**
 * The amount the desk was told to collect, sent with a payment so the server never
 * records more (MYK9-2149). Null when there was no quote: the server's cap alone applies.
 */
export function deskExpectedCollectCents(deskCollect: DeskAddOnCollect): number | null {
  if (deskCollect.kind === 'covered') return 0;
  return deskCollect.collectCents ?? null;
}

/** "Already covered ($40.00 on this form)" */
export function alreadyCoveredLabel(heldCents: number): string {
  return `Already covered (${formatCartCurrency(heldCents)} on this form)`;
}

/** "Collect $20.00 ($10.00 already on this form)" */
export function collectDifferenceLabel(collectCents: number, heldCents: number): string {
  return `Collect ${formatCartCurrency(collectCents)} (${formatCartCurrency(heldCents)} already on this form)`;
}
