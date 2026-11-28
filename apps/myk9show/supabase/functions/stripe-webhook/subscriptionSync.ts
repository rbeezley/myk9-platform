// Sync a Stripe subscription into stripe_subscriptions and the customer's
// exhibitor_profiles tier. Moved out of index.ts for MYK9-2497 so vitest can
// drive it; Deno-free (structural Stripe and Supabase types).
//
// The given subscription's row is always written as Stripe has it. The TIER
// is not read from that one subscription: it comes from the customer's
// entitling subscription (the oldest active or trialing one,
// entitlingSubscription). So a duplicate subscription grants nothing on top
// of the kept one, and cancelling the duplicate (or any other event on a
// non-live subscription) no longer drops a customer who still holds a live
// subscription to free.

import {
  entitlingSubscription,
  listAllSubscriptions,
  type AllSubscriptionsLister,
  type RankedSubscription,
} from '../_shared/customerSubscriptions.ts';
import { persistNoSubscription } from './noSubscription.ts';

export interface SyncedSubscription extends RankedSubscription {
  current_period_start: number;
  current_period_end: number;
  cancel_at_period_end: boolean;
  canceled_at: number | null;
  items: { data: Array<{ price: { id: string } }> };
}

export interface SyncStripe {
  subscriptions: AllSubscriptionsLister<SyncedSubscription>['subscriptions'] & {
    retrieve(id: string): Promise<SyncedSubscription>;
  };
}

type WriteResult = PromiseLike<{ error: unknown }>;

export interface SyncClient {
  from(table: 'stripe_customers' | 'stripe_subscriptions' | 'exhibitor_profiles'): {
    select(columns: string): {
      eq(
        column: string,
        value: string
      ): {
        single(): PromiseLike<{ data: { id: string; person_id: string } | null; error: unknown }>;
      };
    };
    update(values: Record<string, unknown>): {
      eq(column: string, value: string): WriteResult;
    };
    upsert(values: Record<string, unknown>, options: { onConflict: string }): WriteResult;
  };
}

export interface SyncDeps {
  db: SyncClient;
  stripe: SyncStripe;
  mapPriceToTier: (priceId: string | undefined) => 'free' | 'premium';
}

const isoFromUnix = (seconds: number) => new Date(seconds * 1000).toISOString();

/**
 * Returns the customer's subscriptions as Stripe has them now (the given one
 * at its freshest), or null when nothing was synced: the customer is unknown,
 * a write failed, or the customer has no subscription at all.
 */
export async function syncSubscriptionFromStripe(
  deps: SyncDeps,
  stripeCustomerId: string,
  knownSubscriptionId?: string
): Promise<SyncedSubscription[] | null> {
  try {
    const { data: stripeCustomer, error: customerError } = await deps.db
      .from('stripe_customers')
      .select('id, person_id')
      .eq('stripe_customer_id', stripeCustomerId)
      .single();

    if (customerError || !stripeCustomer) {
      console.error('Stripe customer not found in database:', customerError);
      return null;
    }

    // Stripe lists newest first. The known subscription (from the event) is
    // retrieved by id, never picked from the list: the newest is not always
    // the one the event is about.
    const listed = await listAllSubscriptions(deps.stripe, stripeCustomerId);
    const subscription = knownSubscriptionId
      ? await deps.stripe.subscriptions.retrieve(knownSubscriptionId)
      : listed[0];

    if (!subscription) {
      console.log(`No subscriptions found for customer: ${stripeCustomerId}`);
      await persistNoSubscription(deps.db, stripeCustomer, stripeCustomerId);
      return null;
    }
    const all = [subscription, ...listed.filter(sub => sub.id !== subscription.id)];

    const priceId = subscription.items.data[0]?.price.id;
    const { error: subError } = await deps.db.from('stripe_subscriptions').upsert(
      {
        customer_id: stripeCustomer.id,
        stripe_subscription_id: subscription.id,
        stripe_price_id: priceId,
        status: subscription.status,
        current_period_start: isoFromUnix(subscription.current_period_start),
        current_period_end: isoFromUnix(subscription.current_period_end),
        cancel_at_period_end: subscription.cancel_at_period_end,
        cancelled_at: subscription.canceled_at ? isoFromUnix(subscription.canceled_at) : null,
      },
      { onConflict: 'stripe_subscription_id' }
    );

    if (subError) {
      console.error('Error syncing subscription:', subError);
      return null;
    }

    const entitling = entitlingSubscription(all);
    const { error: profileError } = await deps.db
      .from('exhibitor_profiles')
      .update({
        subscription_tier: entitling
          ? deps.mapPriceToTier(entitling.items.data[0]?.price.id)
          : 'free',
        subscription_expires_at: entitling ? isoFromUnix(entitling.current_period_end) : null,
      })
      .eq('person_id', stripeCustomer.person_id);

    if (profileError) {
      console.error('Error updating exhibitor profile:', profileError);
    }

    console.log(
      `Synced subscription ${subscription.id} for customer ${stripeCustomerId}: ${subscription.status}; tier from ${entitling?.id ?? 'none'}`
    );
    return all;
  } catch (error) {
    console.error(`Failed to sync subscription for customer ${stripeCustomerId}:`, error);
    throw error;
  }
}
