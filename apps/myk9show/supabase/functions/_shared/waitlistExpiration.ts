export const DEFAULT_WAITLIST_PAYMENT_DEADLINE_HOURS = 48;

interface QueryResult<T> {
  data: T | null;
  error: { message: string } | null;
}

interface QueryFilter<T> extends PromiseLike<QueryResult<T>> {
  eq(column: string, value: unknown): QueryFilter<T>;
  overlaps(column: string, value: unknown[]): QueryFilter<T>;
  select(columns: string): QueryFilter<T>;
  maybeSingle(): PromiseLike<QueryResult<unknown>>;
}

interface QueryBuilder<T> {
  select(columns: string): QueryFilter<T>;
  update(values: Record<string, unknown>): QueryFilter<T>;
}

export interface WaitlistExpirationSupabase {
  from(table: string): QueryBuilder<unknown>;
}

export interface WaitlistExpirationStripe {
  checkout: {
    sessions: {
      retrieve(id: string): PromiseLike<{ status: string | null; payment_status: string | null }>;
      expire(id: string): PromiseLike<unknown>;
    };
  };
}

export interface ExpiredWaitlistOffer {
  id: string;
  promoted_entry_id: string | null;
}

interface PaymentLinkRow {
  id: string;
  stripe_checkout_session_id: string;
}

interface EntryStatusRow {
  entry_status: string | null;
  payment_status: string | null;
}

export function resolveWaitlistPaymentDeadlineHours(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_WAITLIST_PAYMENT_DEADLINE_HOURS;
  }

  return Math.floor(parsed);
}

export function shouldAbortPaymentLinkExpiration(input: {
  status: string | null;
  paymentStatus: string | null;
}): boolean {
  return input.paymentStatus === 'paid';
}

export async function expireWaitlistOffer(input: {
  supabase: WaitlistExpirationSupabase;
  stripe: WaitlistExpirationStripe | null;
  offer: ExpiredWaitlistOffer;
  nowIso: string;
}): Promise<'expired' | 'paid' | 'error'> {
  const { supabase, stripe, offer, nowIso } = input;

  if (offer.promoted_entry_id) {
    const linkResult = await expireOpenPaymentLinksForEntry({
      supabase,
      stripe,
      entryId: offer.promoted_entry_id,
      nowIso,
    });
    if (linkResult === 'paid') return 'paid';

    const entryResult = await expirePromotedEntry(supabase, offer.promoted_entry_id);
    if (entryResult !== 'expired') return entryResult;
  }

  const { error } = await supabase
    .from('waitlist_entries')
    .update({
      status: 'expired',
      updated_at: nowIso,
    })
    .eq('id', offer.id)
    .eq('status', 'offered');

  if (error) {
    console.error(`Failed to expire waitlist offer ${offer.id}:`, error);
    return 'error';
  }

  return 'expired';
}

async function expirePromotedEntry(
  supabase: WaitlistExpirationSupabase,
  entryId: string
): Promise<'expired' | 'paid' | 'error'> {
  const { data: updatedEntries, error } = await supabase
    .from('entries')
    .update({ entry_status: 'promotion-expired' })
    .eq('id', entryId)
    .eq('entry_status', 'pending-payment')
    .eq('payment_status', 'pending')
    .select('id');

  if (error) {
    console.error(`Failed to expire promoted entry ${entryId}:`, error);
    return 'error';
  }

  if (((updatedEntries as unknown[]) ?? []).length > 0) {
    return 'expired';
  }

  const { data: entry, error: rereadError } = await supabase
    .from('entries')
    .select('entry_status, payment_status')
    .eq('id', entryId)
    .maybeSingle();

  if (rereadError) {
    console.error(`Failed to re-read promoted entry ${entryId}:`, rereadError);
    return 'error';
  }

  const status = entry as EntryStatusRow | null;
  if (status?.payment_status === 'paid' || status?.entry_status === 'confirmed') {
    return 'paid';
  }

  return 'expired';
}

async function expireOpenPaymentLinksForEntry(input: {
  supabase: WaitlistExpirationSupabase;
  stripe: WaitlistExpirationStripe | null;
  entryId: string;
  nowIso: string;
}): Promise<'expired' | 'paid'> {
  const { supabase, stripe, entryId, nowIso } = input;
  const { data: rawLinks, error } = await supabase
    .from('entry_payment_links')
    .select('id, stripe_checkout_session_id')
    .eq('status', 'open')
    .overlaps('entry_ids', [entryId]);

  if (error) {
    console.error(`Could not fetch open payment links for promoted entry ${entryId}:`, error);
    return 'expired';
  }

  const links = (rawLinks ?? []) as PaymentLinkRow[];
  for (const link of links) {
    if (!stripe) {
      console.error('STRIPE_SECRET_KEY is missing; leaving payment link open');
      continue;
    }

    let sessionStatus: string | null = null;
    let paymentStatus: string | null = null;

    try {
      const session = await stripe.checkout.sessions.retrieve(link.stripe_checkout_session_id);
      sessionStatus = session.status ?? null;
      paymentStatus = session.payment_status ?? null;
    } catch (err) {
      console.log(
        `Could not inspect waitlist payment session ${link.stripe_checkout_session_id}:`,
        err
      );
    }

    if (shouldAbortPaymentLinkExpiration({ status: sessionStatus, paymentStatus })) {
      return 'paid';
    }

    if (sessionStatus && sessionStatus !== 'open') {
      await expireAppPaymentLink(supabase, link.id, nowIso);
      continue;
    }

    try {
      await stripe.checkout.sessions.expire(link.stripe_checkout_session_id);
    } catch (err) {
      let recheckStatus: string | null = null;
      let recheckPaymentStatus: string | null = null;
      try {
        const recheck = await stripe.checkout.sessions.retrieve(link.stripe_checkout_session_id);
        recheckStatus = recheck.status ?? null;
        recheckPaymentStatus = recheck.payment_status ?? null;
      } catch {
        // Leave the app-side row open; webhook/autorefund remains the backstop.
      }
      if (
        shouldAbortPaymentLinkExpiration({
          status: recheckStatus,
          paymentStatus: recheckPaymentStatus,
        })
      ) {
        return 'paid';
      }
      if (recheckStatus && recheckStatus !== 'open') {
        await expireAppPaymentLink(supabase, link.id, nowIso);
        continue;
      }
      console.log(
        `Could not expire waitlist payment session ${link.stripe_checkout_session_id}; leaving link open:`,
        err
      );
      continue;
    }

    await expireAppPaymentLink(supabase, link.id, nowIso);
  }

  return 'expired';
}

async function expireAppPaymentLink(
  supabase: WaitlistExpirationSupabase,
  linkId: string,
  nowIso: string
): Promise<void> {
  await supabase
    .from('entry_payment_links')
    .update({ status: 'expired', updated_at: nowIso })
    .eq('id', linkId);
}
