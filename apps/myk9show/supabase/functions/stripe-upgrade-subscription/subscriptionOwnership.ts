// Ownership check for a plan upgrade: stripe_subscriptions -> stripe_customers
// -> people.auth_user_id. The customer lookup is scoped to the running key's
// Stripe mode (MYK9-2344), so a subscription whose customer row belongs to the
// other mode is refused instead of matched across the test/live cutover.
//
// Deno-free (type-only npm import) so it runs under vitest.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.1';

export type SubscriptionOwnership =
  | { ok: true }
  | { ok: false; status: 403 | 404; error: 'Subscription not found' | 'Not authorized' };

export async function verifySubscriptionOwnership(
  supabase: SupabaseClient,
  params: { subscriptionId: string; authUserId: string; stripeLivemode: boolean }
): Promise<SubscriptionOwnership> {
  const { subscriptionId, authUserId, stripeLivemode } = params;

  const { data: sub, error: subError } = await supabase
    .from('stripe_subscriptions')
    .select('id, customer_id')
    .eq('stripe_subscription_id', subscriptionId)
    .single();

  if (subError || !sub) {
    return { ok: false, status: 404, error: 'Subscription not found' };
  }

  const { data: customer, error: customerError } = await supabase
    .from('stripe_customers')
    .select('person_id')
    .eq('id', sub.customer_id)
    .eq('livemode', stripeLivemode)
    .single();

  if (customerError || !customer) {
    return { ok: false, status: 404, error: 'Subscription not found' };
  }

  const { data: person, error: personError } = await supabase
    .from('people')
    .select('id')
    .eq('id', customer.person_id)
    .eq('auth_user_id', authUserId)
    .single();

  if (personError || !person) {
    return { ok: false, status: 403, error: 'Not authorized' };
  }

  return { ok: true };
}
