import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { CreditCard, Calendar, Settings, AlertCircle, Crown, Sparkles } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { logger } from '@/services/LoggingService';
import { products, annualPriceId } from '@/stripe-config';
import { useEntitlement } from '@/features/entitlement/useEntitlement';
import type { EffectiveEntitlement, EntitlementSource } from '@/features/entitlement/types';

/** Display amount/interval per known price id; unknown ids show no price line. */
function priceDisplay(priceId: string | null): { amount: number; interval: 'month' | 'year' } {
  if (priceId && priceId === annualPriceId) return { amount: 4900, interval: 'year' };
  if (priceId === products.premium.priceId) return { amount: 499, interval: 'month' };
  return { amount: 0, interval: 'month' };
}

/** Real Stripe billing details for the "paid" source only — never shown for grants. */
interface BillingDetails {
  status: 'active' | 'past_due' | 'canceled' | 'unpaid';
  amount: number;
  interval: 'month' | 'year';
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
}

interface SubscriptionManagerProps {
  /**
   * Path Stripe returns to after the customer portal closes. Defaults to
   * `/pricing-page` (standalone page behaviour); the account billing section
   * passes its own URL so the user lands back where they started.
   */
  portalReturnPath?: string;
}

const SOURCE_LABEL: Record<Exclude<EntitlementSource, 'none'>, string> = {
  paid: 'Premium',
  founding: 'Founding Member Premium',
  complimentary: 'Complimentary Premium',
};

export function SubscriptionManager({
  portalReturnPath = '/pricing-page',
}: SubscriptionManagerProps = {}) {
  const { user } = useAuth();
  const { effective, isLoading, isError, refetch } = useEntitlement();
  const [billing, setBilling] = useState<BillingDetails | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);

  const showPaidBilling = effective?.status === 'active' && effective.source === 'paid';

  const fetchBillingDetails = useCallback(async () => {
    try {
      setBillingLoading(true);

      // stripe_subscriptions.customer_id is a stripe_customers row uuid, NOT
      // the auth user id — resolve our own customer row first. Filter by the
      // caller's person id explicitly: RLS scopes normal users, but site
      // admins can read EVERY customer row, so "newest visible row" alone
      // would show an admin someone else's subscription (Codex P2).
      const { data: me, error: meError } = await supabase
        .from('people')
        .select('id')
        .eq('auth_user_id', user?.id ?? '')
        .maybeSingle();

      if (meError) throw meError;

      const { data: customer, error: customerError } = me
        ? await supabase
            .from('stripe_customers')
            .select('id')
            .eq('person_id', me.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
        : { data: null, error: null };

      if (customerError) throw customerError;

      const { data: subData, error: subError } = customer
        ? await supabase
            .from('stripe_subscriptions')
            .select(
              'status, stripe_price_id, current_period_start, current_period_end, cancel_at_period_end, customer_id'
            )
            .eq('customer_id', customer.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
        : { data: null, error: null };

      if (subError) throw subError;

      if (subData) {
        const { amount, interval } = priceDisplay(subData.stripe_price_id);
        setBilling({
          status:
            subData.status === 'active'
              ? 'active'
              : subData.status === 'canceled'
                ? 'canceled'
                : subData.status === 'past_due'
                  ? 'past_due'
                  : 'unpaid',
          amount,
          interval,
          currentPeriodStart: new Date(subData.current_period_start || new Date().toISOString()),
          currentPeriodEnd: new Date(subData.current_period_end || new Date().toISOString()),
          cancelAtPeriodEnd: subData.cancel_at_period_end || false,
        });
      } else {
        setBilling(null);
      }
    } catch (err) {
      logger.error('Error fetching billing details:', 'components', {}, err as Error);
      setPortalError('Failed to load billing information');
    } finally {
      setBillingLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (user && showPaidBilling) {
      fetchBillingDetails();
    }
  }, [user, showPaidBilling, fetchBillingDetails]);

  const openCustomerPortal = async () => {
    try {
      setPortalError(null);
      // MP-27: the edge function derives the Stripe customer from the
      // authenticated user — no customer id crosses the wire.
      const { data, error } = await supabase.functions.invoke('stripe-customer-portal', {
        body: {
          returnUrl: window.location.origin + portalReturnPath,
        },
      });

      if (error) throw error;

      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      logger.error('Error opening customer portal:', 'components', {}, err as Error);
      setPortalError('Failed to open customer portal');
    }
  };

  // Neutral loading state: no lock/unlock flash while entitlement resolves.
  if (isLoading && !effective) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-40 bg-muted rounded-lg"></div>
        </div>
      </div>
    );
  }

  if (isError && !effective) {
    return (
      <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg flex items-start gap-3">
        <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="text-destructive text-sm">
            We couldn't verify your account access right now. Your billing and access are unchanged
            — try again.
          </p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      {isError && effective && (
        <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
          <p className="text-destructive text-sm">
            We couldn't refresh your account access. Showing the last known state.
          </p>
        </div>
      )}
      {portalError && (
        <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
          <p className="text-destructive text-sm">{portalError}</p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Current Plan
          </CardTitle>
        </CardHeader>
        <CardContent>{effective && <SubscriptionStatus effective={effective} />}</CardContent>
      </Card>

      {showPaidBilling && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Billing
            </CardTitle>
          </CardHeader>
          <CardContent>
            {billingLoading && !billing ? (
              <div className="animate-pulse h-24 bg-muted rounded-lg" />
            ) : billing ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Current Period</p>
                    <p className="font-medium">
                      {billing.currentPeriodStart.toLocaleDateString()} -{' '}
                      {billing.currentPeriodEnd.toLocaleDateString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Next Billing</p>
                    <p className="font-medium">
                      {billing.cancelAtPeriodEnd
                        ? 'Subscription will cancel'
                        : billing.currentPeriodEnd.toLocaleDateString()}
                    </p>
                  </div>
                  {billing.amount > 0 && (
                    <div>
                      <p className="text-muted-foreground">Amount</p>
                      <p className="font-medium">
                        ${billing.amount / 100} / {billing.interval}
                      </p>
                    </div>
                  )}
                </div>

                {billing.cancelAtPeriodEnd && (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5" />
                    <p className="text-amber-800 text-sm">
                      Your subscription will cancel at the end of the current billing period.
                    </p>
                  </div>
                )}

                <Separator />

                <Button onClick={openCustomerPortal} className="flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Manage Subscription
                </Button>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">Billing details are unavailable.</p>
            )}
          </CardContent>
        </Card>
      )}
    </motion.div>
  );
}

function SubscriptionStatus({ effective }: { effective: EffectiveEntitlement }) {
  if (effective.status === 'active') {
    const { source } = effective;
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Crown className="h-5 w-5 text-amber-500" />
            <h3 className="font-semibold text-lg">{SOURCE_LABEL[source]}</h3>
          </div>
          <Badge className="bg-success/10 text-success">Active</Badge>
        </div>
        {source === 'paid' ? (
          <p className="text-sm text-muted-foreground">
            Renews {new Date(effective.endsAt).toLocaleDateString()}.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {source === 'founding' ? 'Founding member premium' : 'Complimentary premium'} through{' '}
            {new Date(effective.endsAt).toLocaleDateString()}. Billing is not applicable — this
            access was granted, not purchased.
          </p>
        )}
      </div>
    );
  }

  if (effective.status === 'expired') {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Crown className="h-5 w-5 text-muted-foreground" />
            <h3 className="font-semibold text-lg">Premium access ended</h3>
          </div>
          <Badge variant="secondary">Expired</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Your Premium access ended {new Date(effective.endsAt).toLocaleDateString()}.
        </p>
        <Button onClick={() => (window.location.href = '/pricing-page')}>
          View plans to resubscribe
        </Button>
      </div>
    );
  }

  // status === 'free'
  const trial = effective.analyticsTrial;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-lg">Free</h3>
        <Badge variant="outline">Free</Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        You're on the free plan. Upgrade to unlock title tracking, health records, training journal,
        and pedigree management.
      </p>
      {trial.status === 'active' && (
        <div className="p-3 bg-muted rounded-lg flex items-start gap-2">
          <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <p className="text-sm">
            Premium Analytics trial: {trial.scoredShowCount ?? 0} of {trial.showLimit} scored shows
            used. This unlocks Analytics only — it is not an account subscription.
          </p>
        </div>
      )}
      <Button onClick={() => (window.location.href = '/pricing-page')}>View Plans</Button>
    </div>
  );
}
