/**
 * Checkout Success Page
 *
 * Displayed after successful payment on Stripe.
 * Verifies the checkout session and shows entry confirmation.
 */

import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  CheckCircle,
  Loader2,
  AlertCircle,
  Receipt,
  Calendar,
  Dog,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { verifyCheckoutSession } from '@/lib/stripe';
import { useCartStore } from '@/store/cartStore';
import { supabase } from '@/lib/supabase';

interface EntryDetails {
  id: string;
  dog_name: string;
  class_name: string;
  class_level: string | null;
}

export default function CheckoutSuccessPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const sessionId = searchParams.get('session_id');

  const [isLoading, setIsLoading] = useState(true);
  const [_isVerified, setIsVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orderDetails, setOrderDetails] = useState<{
    orderId?: string;
    showName?: string;
    showId?: string;
    totalAmount?: number;
    entryIds?: string[];
    confirmationNumber?: string;
  } | null>(null);
  const [entries, setEntries] = useState<EntryDetails[]>([]);

  // Reset cart on successful payment
  const resetCart = useCartStore(state => state.reset);

  useEffect(() => {
    const verifyPayment = async () => {
      if (!sessionId) {
        setError('No checkout session found. Please try again.');
        setIsLoading(false);
        return;
      }

      // Poll for order completion (webhook may have slight delay)
      let attempts = 0;
      const maxAttempts = 10;
      const pollInterval = 2000; // 2 seconds

      const poll = async (): Promise<boolean> => {
        const result = await verifyCheckoutSession(sessionId);

        if (result.success) {
          setOrderDetails({
            ...(result.orderId !== undefined && { orderId: result.orderId }),
            ...(result.showName !== undefined && { showName: result.showName }),
            ...(result.showId !== undefined && { showId: result.showId }),
            ...(result.totalAmount !== undefined && { totalAmount: result.totalAmount }),
            ...(result.entryIds !== undefined && { entryIds: result.entryIds }),
            ...(result.confirmationNumber !== undefined && {
              confirmationNumber: result.confirmationNumber,
            }),
          });
          setIsVerified(true);

          // Fetch entry details
          if (result.entryIds && result.entryIds.length > 0) {
            const { data } = await supabase
              .from('entries')
              .select(
                `
                id,
                dogs:dog_id (name, call_name),
                classes:class_id (name, level)
              `
              )
              .in('id', result.entryIds);

            if (data) {
              setEntries(
                data.map(e => ({
                  id: e.id,
                  dog_name:
                    (e.dogs as { call_name?: string; name: string })?.call_name ||
                    (e.dogs as { name: string })?.name ||
                    'Unknown',
                  class_name: (e.classes as { name: string })?.name || 'Unknown',
                  class_level: (e.classes as { level?: string })?.level || null,
                }))
              );
            }
          }

          // Clear the cart since payment succeeded
          resetCart();

          return true;
        }

        return false;
      };

      // Initial check
      if (await poll()) {
        setIsLoading(false);
        return;
      }

      // Poll with retries
      const intervalId = setInterval(async () => {
        attempts++;

        if (await poll()) {
          clearInterval(intervalId);
          setIsLoading(false);
          return;
        }

        if (attempts >= maxAttempts) {
          clearInterval(intervalId);
          setError(
            'Payment verification is taking longer than expected. Your payment was likely successful - please check your email for confirmation or contact support.'
          );
          setIsLoading(false);
        }
      }, pollInterval);

      return () => clearInterval(intervalId);
    };

    verifyPayment();
  }, [sessionId, resetCart]);

  const formatCurrency = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="bg-background pt-6">
        <div className="max-w-2xl mx-auto px-4 py-16">
          <Card>
            <CardContent className="py-16 text-center">
              <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4 text-primary" />
              <h2 className="text-xl font-semibold mb-2">Verifying your payment...</h2>
              <p className="text-muted-foreground">
                Please wait while we confirm your entry submission.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="bg-background pt-6">
        <div className="max-w-2xl mx-auto px-4 py-16">
          <Card>
            <CardContent className="py-16 text-center">
              <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="h-8 w-8 text-amber-600 dark:text-amber-400" />
              </div>
              <h2 className="text-xl font-semibold mb-2">Verification Pending</h2>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">{error}</p>
              <div className="flex gap-3 justify-center">
                <Button variant="outline" onClick={() => navigate('/shows')}>
                  Browse Shows
                </Button>
                <Button onClick={() => window.location.reload()}>Retry Verification</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Success state
  return (
    <div className="bg-background pt-6">
      <div className="max-w-2xl mx-auto px-4 py-16">
        <Card>
          <CardHeader className="text-center pb-2">
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
            <CardTitle className="text-2xl">Entry Submitted Successfully!</CardTitle>
            <p className="text-muted-foreground mt-2">
              Your payment has been processed and your entries are confirmed.
            </p>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Confirmation Number */}
            {orderDetails?.confirmationNumber && (
              <div className="rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-4 text-center">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                  Confirmation Number
                </p>
                <p className="text-2xl font-mono font-bold text-green-700 dark:text-green-400">
                  {orderDetails.confirmationNumber}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Save this number for your records
                </p>
              </div>
            )}

            {/* Order Summary */}
            {orderDetails && (
              <Alert className="bg-muted/50">
                <Receipt className="h-4 w-4" />
                <AlertDescription>
                  <div className="flex justify-between items-center">
                    <span>Order Total</span>
                    <span className="font-semibold">
                      {orderDetails.totalAmount ? formatCurrency(orderDetails.totalAmount) : '—'}
                    </span>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {/* Show Info */}
            {orderDetails?.showName && (
              <div className="flex items-center gap-3 p-4 rounded-lg border">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Entering</p>
                  <p className="font-medium">{orderDetails.showName}</p>
                </div>
              </div>
            )}

            <Separator />

            {/* Entry Details */}
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Dog className="h-4 w-4" />
                Your Entries ({entries.length})
              </h3>
              <div className="space-y-2">
                {entries.map(entry => (
                  <div
                    key={entry.id}
                    className="flex justify-between items-center p-3 rounded-lg bg-muted/30"
                  >
                    <div>
                      <p className="font-medium">{entry.dog_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {entry.class_name}
                        {entry.class_level && ` - ${entry.class_level}`}
                      </p>
                    </div>
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Next Steps */}
            <div className="text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-2">What happens next?</p>
              <ul className="list-disc list-inside space-y-1">
                <li>You'll receive a confirmation email shortly</li>
                <li>Check in at the venue on the day of the show</li>
                <li>Your armband number will be assigned at check-in</li>
              </ul>
            </div>
          </CardContent>

          <CardFooter className="flex-col gap-2">
            <Button className="w-full" onClick={() => navigate('/my-entries')}>
              View My Entries
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
            {orderDetails?.showId && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => navigate(`/shows/${orderDetails.showId}`)}
              >
                View Show Details
              </Button>
            )}
            <Button variant="ghost" className="w-full" onClick={() => navigate('/shows')}>
              Browse More Shows
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
