/**
 * Cart Page
 *
 * Full cart review page where exhibitors can review all cart items,
 * modify entries, and proceed to checkout.
 */

import { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { ShoppingCart, ArrowLeft, Trash2, AlertCircle, Eye, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useCartStore, useCartItems } from '@/store/cartStore';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useExhibitorProfile } from '@/hooks/useExhibitorProfile';
import { CartItemCard } from '@/components/cart/CartItemCard';
import { CartSummary } from '@/components/cart/CartSummary';
import { createEntryCheckoutSession } from '@/lib/stripe';
import { useJudgeDayCapacity } from '@/hooks/queries/useJudgeDayCapacity';
import { writeCartSplitCheckoutSummary } from '@/features/payments/cartSplitCheckoutStorage';
import { splitCartItemsByJudgeDayCapacity } from '@/features/payments/cartCapacitySplit';

function createSplitCheckoutCorrelationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `split-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function CartPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuthContext();
  const { profile, isLoading: isProfileLoading } = useExhibitorProfile();
  const cart = useCartStore(state => state.cart);
  const items = useCartItems();
  const isCartLoading = useCartStore(state => state.isLoading);
  const loadInitiated = useCartStore(state => state.loadInitiated);
  const error = useCartStore(state => state.error);
  const removeItem = useCartStore(state => state.removeItem);
  const clearCart = useCartStore(state => state.clearCart);
  const setError = useCartStore(state => state.setError);
  const loadActiveCart = useCartStore(state => state.loadActiveCart);
  const checkoutWithWaitlist = useCartStore(state => state.checkoutWithWaitlist);
  const {
    judgeDays,
    isLoading: isCapacityLoading,
    error: capacityError,
  } = useJudgeDayCapacity(cart?.show_id);

  const [removingItemId, setRemovingItemId] = useState<string | null>(null);
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const recoveryShowId = searchParams.get('showId') ?? undefined;
  const recoveryEntryIdsParam = searchParams.get('entryIds') ?? '';
  const recoveryEntryIds = useMemo(
    () =>
      recoveryEntryIdsParam
        .split(',')
        .map(id => id.trim())
        .filter(Boolean),
    [recoveryEntryIdsParam]
  );

  // Redirect if not authenticated
  useEffect(() => {
    if (!user) {
      navigate('/sign-in', { state: { from: '/cart' } });
    }
  }, [user, navigate]);

  // Hydrate the active cart on direct visits (refresh, deep link, new tab) —
  // the store is in-memory only, so without this the page always shows empty
  // unless the same tab just populated it (2026-06-10 walkthrough finding).
  useEffect(() => {
    if (profile?.id) {
      const cartLoadOptions: {
        showId?: string;
        recoveryEntryIds?: string[];
      } = { recoveryEntryIds };

      if (recoveryShowId) {
        cartLoadOptions.showId = recoveryShowId;
      }

      loadActiveCart(profile.id, cartLoadOptions);
    }
  }, [profile?.id, loadActiveCart, recoveryShowId, recoveryEntryIds]);

  const handleRemoveItem = async (itemId: string) => {
    setRemovingItemId(itemId);
    setError(null);

    const success = await removeItem(itemId);

    if (!success) {
      // Error is set in store
    }

    setRemovingItemId(null);
  };

  const handleClearCart = async () => {
    setIsClearing(true);
    await clearCart();
    setIsClearing(false);
    setShowClearDialog(false);
  };

  const handleCheckout = async () => {
    if (!cart?.id) {
      setError('No cart found. Please add items to your cart.');
      return;
    }
    if (!profile?.id) {
      setError('Could not verify your exhibitor profile. Please sign in again.');
      return;
    }
    if (isCapacityLoading) {
      setError('Class availability is still loading. Please try checkout again in a moment.');
      return;
    }
    if (capacityError) {
      setError('Could not verify class availability right now. Please try again.');
      return;
    }

    setIsCheckingOut(true);
    setError(null);

    try {
      const splitDecision = splitCartItemsByJudgeDayCapacity(items, judgeDays);
      const blockedItems = splitDecision.blockedItems;

      if (blockedItems.length > 0) {
        setError(
          `${blockedItems.map(item => item.class?.name || 'A class').join(', ')} ${
            blockedItems.length === 1 ? 'is' : 'are'
          } full and not accepting wait list entries. Remove ${
            blockedItems.length === 1 ? 'it' : 'them'
          } to continue.`
        );
        setIsCheckingOut(false);
        return;
      }

      const splitResult = await checkoutWithWaitlist(profile.id, splitDecision.waitlistItemIds);

      if (!splitResult) {
        setIsCheckingOut(false);
        return;
      }

      const waitlistedItemIds = Array.from(splitDecision.waitlistItemIds);

      for (const itemId of waitlistedItemIds) {
        const removed = await removeItem(itemId);
        if (!removed) {
          setError(
            'Your wait list request was saved, but we could not refresh the cart for payment. Please reload the cart before trying again.'
          );
          setIsCheckingOut(false);
          return;
        }
      }

      const splitCheckoutId =
        splitResult.waitlisted.length > 0 ? createSplitCheckoutCorrelationId() : null;

      if (splitCheckoutId) {
        writeCartSplitCheckoutSummary({
          correlationId: splitCheckoutId,
          showId: cart.show_id,
          confirmedEntryCount: splitResult.confirmed.length,
          waitlistEntries: splitResult.waitlisted,
        });
      }

      if (splitResult.confirmed.length === 0) {
        navigate(
          splitCheckoutId
            ? `/checkout/success?waitlist=1&split=${encodeURIComponent(splitCheckoutId)}`
            : '/checkout/success?waitlist=1'
        );
        return;
      }

      // This will redirect to Stripe Checkout for the remaining confirmed entries.
      await createEntryCheckoutSession(cart.id, splitCheckoutId ? { splitCheckoutId } : undefined);
      // If we get here, the redirect didn't happen (shouldn't normally occur)
    } catch (_err) {
      setError('Something went wrong starting checkout. Please try again.');
      setIsCheckingOut(false);
    }
  };

  const handleContinueShopping = () => {
    if (cart?.show_id) {
      navigate(`/shows/${cart.show_id}`);
    } else {
      navigate('/shows');
    }
  };

  // Loading state — wait for the profile to resolve and the cart to hydrate
  // before deciding the cart is empty. Without this, a direct visit (refresh,
  // deep link, new device) flashes the empty-cart zero-state over a cart that
  // is still loading.
  //
  // The cart-load effect runs AFTER the first render, so on that first frame a
  // resolved exhibitor profile has isProfileLoading === false and isCartLoading
  // === false even though the load has not started — which would fall through
  // to the empty state for one frame. The store flips loadInitiated true the
  // moment loadActiveCart begins, so "profile resolved with an id but no load
  // initiated yet" still counts as hydrating.
  const awaitingCartLoad = Boolean(profile?.id) && !loadInitiated;
  const isHydrating =
    items.length === 0 && (isProfileLoading || isCartLoading || awaitingCartLoad);
  if (isHydrating) {
    return (
      <div className="bg-background pt-6">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div
            className="flex flex-col items-center justify-center py-16 text-center"
            role="status"
            aria-live="polite"
          >
            <Loader2 className="h-10 w-10 text-muted-foreground animate-spin mb-4" />
            <p className="text-muted-foreground">Loading your cart…</p>
          </div>
        </div>
      </div>
    );
  }

  // Empty cart state
  if (!cart || items.length === 0) {
    return (
      <div className="bg-background pt-6">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-6">
              <ShoppingCart className="h-10 w-10 text-muted-foreground" />
            </div>
            <h1 className="text-2xl font-bold mb-2">Your cart is empty</h1>
            <p className="text-muted-foreground mb-6 max-w-md">
              Browse upcoming shows and add entries to your cart to get started.
            </p>
            <Button onClick={() => navigate('/shows')} size="lg">
              <Eye className="h-4 w-4 mr-2" />
              Browse Shows
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background pt-6">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="default"
              onClick={() => navigate(cart.show_id ? `/shows/${cart.show_id}` : '/shows')}
              className="gap-1 min-h-[44px]"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <ShoppingCart className="h-6 w-6" />
                Your Cart
              </h1>
              {cart.show && (
                <p className="text-sm text-muted-foreground mt-1">
                  Entering:{' '}
                  <Link to={`/shows/${cart.show.id}`} className="text-primary hover:underline">
                    {cart.show.name}
                  </Link>
                </p>
              )}
            </div>
          </div>

          {items.length > 0 && (
            <Button
              variant="outline"
              size="default"
              onClick={() => setShowClearDialog(true)}
              className="min-h-[44px] text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Clear Cart
            </Button>
          )}
        </div>

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Cart Items */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {items.length} {items.length === 1 ? 'Entry' : 'Entries'}
              </h2>
            </div>

            {items.map(item => (
              <CartItemCard
                key={item.id}
                item={item}
                onRemove={() => handleRemoveItem(item.id)}
                isRemoving={removingItemId === item.id}
              />
            ))}
          </div>

          {/* Order Summary */}
          <div className="lg:col-span-1">
            <div className="sticky top-24">
              <CartSummary
                onCheckout={handleCheckout}
                onContinueShopping={handleContinueShopping}
                isCheckingOut={isCheckingOut}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Clear Cart Confirmation Dialog */}
      <AlertDialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear cart?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove all {items.length} {items.length === 1 ? 'entry' : 'entries'} from
              your cart. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isClearing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleClearCart}
              disabled={isClearing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isClearing ? 'Clearing...' : 'Clear Cart'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
