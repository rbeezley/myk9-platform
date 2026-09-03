type WriteResult = PromiseLike<{ error: unknown }>;

interface NoSubscriptionClient {
  from(table: 'stripe_subscriptions' | 'exhibitor_profiles'): {
    update(values: Record<string, unknown>): {
      eq(column: string, value: string): WriteResult;
    };
    upsert(values: Record<string, unknown>, options: { onConflict: string }): WriteResult;
  };
}

/** Persist the existing no-subscription state before downgrading the profile. */
export async function persistNoSubscription(
  supabase: NoSubscriptionClient,
  stripeCustomer: { id: string; person_id: string },
  stripeCustomerId: string
): Promise<void> {
  // Update to no subscription state
  const { error: staleSubscriptionError } = await supabase
    .from('stripe_subscriptions')
    .update({ status: 'none' })
    .eq('customer_id', stripeCustomer.id);
  if (staleSubscriptionError) {
    console.error('Error clearing stale subscriptions:', staleSubscriptionError);
    return;
  }

  const { error: noSubscriptionError } = await supabase.from('stripe_subscriptions').upsert(
    {
      customer_id: stripeCustomer.id,
      stripe_subscription_id: `none_${stripeCustomerId}`,
      status: 'none',
    },
    {
      onConflict: 'stripe_subscription_id',
    }
  );

  if (noSubscriptionError) {
    console.error('Error recording missing subscription:', noSubscriptionError);
    return;
  }

  // Reset exhibitor profile subscription
  await supabase
    .from('exhibitor_profiles')
    .update({
      subscription_tier: 'free',
      subscription_expires_at: null,
    })
    .eq('person_id', stripeCustomer.person_id);
}
