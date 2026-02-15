import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  CreditCard,
  Calendar,
  Star,
  Settings,
  Download,
  AlertCircle,
  Crown,
  Zap
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { logger } from '@/services/LoggingService';

interface Subscription {
  id: string;
  status: 'active' | 'past_due' | 'canceled' | 'unpaid';
  planName: string;
  planType: 'basic' | 'premium' | 'enterprise';
  amount: number;
  currency: string;
  interval: 'month' | 'year';
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
}

interface Invoice {
  id: string;
  amount: number;
  currency: string;
  status: string;
  created: Date;
  invoiceUrl: string;
  invoicePdf: string;
}

export function SubscriptionManager() {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSubscriptionData = useCallback(async () => {
    try {
      setLoading(true);
      
      // Fetch subscription from Supabase
      const { data: subData, error: subError } = await supabase
        .from('stripe_subscriptions')
        .select('stripe_subscription_id, status, stripe_price_id, current_period_start, current_period_end, cancel_at_period_end, customer_id')
        .eq('customer_id', user?.id || '')
        .single();

      if (subError && subError.code !== 'PGRST116') { // PGRST116 = no rows returned
        throw subError;
      }

      if (subData) {
        setSubscription({
          id: subData.stripe_subscription_id || '',
          status: subData.status === 'active' ? 'active' :
                  subData.status === 'canceled' ? 'canceled' :
                  subData.status === 'past_due' ? 'past_due' : 'unpaid',
          planName: 'Plan', // Not available in view
          planType: 'basic', // Default value
          amount: 0, // Not available in view
          currency: 'usd',
          interval: 'month' as const,
          currentPeriodStart: new Date(subData.current_period_start || new Date().toISOString()),
          currentPeriodEnd: new Date(subData.current_period_end || new Date().toISOString()),
          cancelAtPeriodEnd: subData.cancel_at_period_end || false,
          stripeCustomerId: subData.customer_id || '',
          stripeSubscriptionId: subData.stripe_subscription_id || ''
        });

        // Fetch invoices
        const { data: invoiceData, error: invoiceError } = await supabase
          .from('stripe_orders')
          .select('*')
          .eq('customer_id', subData.customer_id || '')
          .order('created_at', { ascending: false })
          .limit(10);

        if (invoiceError) throw invoiceError;

        setInvoices(invoiceData?.map(inv => ({
          id: inv.id.toString(),
          amount: inv.amount_cents,
          currency: inv.currency || 'usd',
          status: inv.status || 'unknown',
          created: new Date(inv.created_at || ''),
          invoiceUrl: '#', // Not available in orders
          invoicePdf: '#' // Not available in orders
        })) || []);
      }
    } catch (err) {
      logger.error('Error fetching subscription:', 'components', {}, err as Error);
      setError('Failed to load subscription information');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (user) {
      fetchSubscriptionData();
    }
  }, [user, fetchSubscriptionData]);

  const openCustomerPortal = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('stripe-customer-portal', {
        body: { 
          customerId: subscription?.stripeCustomerId,
          returnUrl: window.location.origin + '/pricing-page'
        }
      });

      if (error) throw error;

      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      logger.error('Error opening customer portal:', 'components', {}, err as Error);
      setError('Failed to open customer portal');
    }
  };


  const upgradeSubscription = async (newPlanId: string) => {
    try {
      const { error } = await supabase.functions.invoke('stripe-upgrade-subscription', {
        body: { 
          subscriptionId: subscription?.stripeSubscriptionId,
          newPlanId 
        }
      });

      if (error) throw error;

      await fetchSubscriptionData(); // Refresh data
    } catch (err) {
      logger.error('Error upgrading subscription:', 'components', {}, err as Error);
      setError('Failed to upgrade subscription');
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-40 bg-muted rounded-lg"></div>
          <div className="h-60 bg-muted rounded-lg"></div>
        </div>
      </div>
    );
  }

  const getPlanIcon = (planType: string) => {
    switch (planType) {
      case 'enterprise': {
        return <Crown className="h-5 w-5 text-purple-500" />;
      }
      case 'premium': {
        return <Star className="h-5 w-5 text-amber-500" />;
      }
      default: {
        return <Zap className="h-5 w-5 text-blue-500" />;
      }
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active': {
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Active</Badge>;
      }
      case 'past_due': {
        return <Badge variant="destructive">Past Due</Badge>;
      }
      case 'canceled': {
        return <Badge variant="secondary">Canceled</Badge>;
      }
      default: {
        return <Badge variant="outline">{status}</Badge>;
      }
    }
  };

  return (
    <motion.div 
      className="space-y-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}

      {/* Current Subscription */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Current Subscription
          </CardTitle>
        </CardHeader>
        <CardContent>
          {subscription ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {getPlanIcon(subscription.planType)}
                  <div>
                    <h3 className="font-semibold text-lg">{subscription.planName}</h3>
                    <p className="text-sm text-muted-foreground">
                      ${subscription.amount / 100} / {subscription.interval}
                    </p>
                  </div>
                </div>
                {getStatusBadge(subscription.status)}
              </div>

              <Separator />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Current Period</p>
                  <p className="font-medium">
                    {subscription.currentPeriodStart.toLocaleDateString()} - {subscription.currentPeriodEnd.toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Next Billing</p>
                  <p className="font-medium">
                    {subscription.cancelAtPeriodEnd ? 
                      'Subscription will cancel' : 
                      subscription.currentPeriodEnd.toLocaleDateString()
                    }
                  </p>
                </div>
              </div>

              {subscription.cancelAtPeriodEnd && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5" />
                  <p className="text-amber-800 text-sm">
                    Your subscription will cancel at the end of the current billing period.
                  </p>
                </div>
              )}

              <div className="flex gap-2 pt-4">
                <Button onClick={openCustomerPortal} className="flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Manage Subscription
                </Button>
                
                {subscription.planType === 'basic' && (
                  <Button 
                    variant="outline"
                    onClick={() => upgradeSubscription('premium')}
                    className="flex items-center gap-2"
                  >
                    <Star className="h-4 w-4" />
                    Upgrade to Premium
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-4">No active subscription</p>
              <Button onClick={() => window.location.href = '/pricing-page'}>
                View Plans
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Billing History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Billing History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {invoices.length > 0 ? (
            <div className="space-y-3">
              {invoices.map(invoice => (
                <div key={invoice.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-medium">
                      ${invoice.amount / 100} {invoice.currency.toUpperCase()}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {invoice.created.toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={invoice.status === 'paid' ? 'default' : 'destructive'}>
                      {invoice.status}
                    </Badge>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => window.open(invoice.invoicePdf, '_blank')}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No billing history available
            </div>
          )}
        </CardContent>
      </Card>

      {/* Usage Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Usage This Month</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold">12</p>
              <p className="text-sm text-muted-foreground">Shows Created</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold">45</p>
              <p className="text-sm text-muted-foreground">Dogs Registered</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold">89</p>
              <p className="text-sm text-muted-foreground">Entries Processed</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold">156</p>
              <p className="text-sm text-muted-foreground">Reports Generated</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}