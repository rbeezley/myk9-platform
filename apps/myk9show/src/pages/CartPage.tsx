/**
 * Cart Page
 *
 * Full cart review page where exhibitors can review all cart items,
 * modify entries, and proceed to checkout.
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { ShoppingCart, ArrowLeft, Trash2, AlertCircle, Eye, Info, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/common/SkeletonLoaders';
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
import { CHECKOUT_RETURN_PARAM, readCheckoutReturnStatus } from './cartCheckoutNotice';
import { useJudgeDayCapacity } from '@/hooks/queries/useJudgeDayCapacity';
import { writeCartSplitCheckoutSummary } from '@/features/payments/cartSplitCheckoutStorage';
import { splitCartItemsByJudgeDayCapacity } from '@/features/payments/cartCapacitySplit';
import { buildCartFulfillmentView } from '@/features/payments/cartFulfillmentView';

function createSplitCheckoutCorrelationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `split-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function CartPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
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
  // Imperative in-flight latch: the disabled={isCheckingOut} prop lags one
  // render, so two clicks in the same frame would start two checkout
  // sessions. Deliberately NOT released on the successful redirect path —
  // the page is navigating away to Stripe.
  const checkoutInFlightRef = useRef(false);
  const [cancelNoticeDismissed, setCancelNoticeDismissed] = useState(false);

  // Reading the Stripe cancel return param is purely informational — the cart
  // itself is untouched, so this banner reassures rather than alarms.
  const showCancelNotice =
    readCheckoutReturnStatus(searchParams) === 'cancelled' && !cancelNoticeDismissed;

  const dismissCancelNotice = () => {
    setCancelNoticeDismissed(true);
    // Strip the param so a refresh or back-nav doesn't resurrect the banner.
    const next = new URLSearchParams(searchParams);
    next.delete(CHECKOUT_RETURN_PARAM);
    setSearchParams(next, { replace: true });
  };

  // MYK9-122: the cart, its totals, and checkout must all be driven by ONE
  // rule. This is the same split checkout runs — computed here so a full class
  // reads as a wait-list request up front instead of looking payable, moving
  // the total, and then disappearing once checkout routes it to the wait list.
  // `null` while capacity is loading or errored: unknown availability must not
  // be presented as a final amount.
  const capacityResolved = !isCapacityLoading && !capacityError;
  const fulfillment = useMemo(
    () => buildCartFulfillmentView(items, capacityResolved ? judgeDays : null),
    [items, judgeDays, capacityResolved]
  );

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

  const stopCheckingOut = () => {
    checkoutInFlightRef.current = false;
    setIsCheckingOut(false);
  };

  const handleCheckout = async () => {
    if (checkoutInFlightRef.current) return;
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

    checkoutInFlightRef.current = true;
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
        stopCheckingOut();
        return;
      }

      const splitResult = await checkoutWithWaitlist(profile.id, splitDecision.waitlistItemIds);

      if (!splitResult) {
        stopCheckingOut();
        return;
      }

      const waitlistedItemIds = Array.from(splitDecision.waitlistItemIds);

      for (const itemId of waitlistedItemIds) {
        const removed = await removeItem(itemId);
        if (!removed) {
          setError(
            'Your wait list request was saved, but we could not refresh the cart for payment. Please reload the cart before trying again.'
          );
          stopCheckingOut();
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
        stopCheckingOut();
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
      stopCheckingOut();
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
  const isHydrating = items.length === 0 && (isProfileLoading || isCartLoading || awaitingCartLoad);
  if (isHydrating) {
    return (
      <div className="bg-background pt-6">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="space-y-6 py-8" role="status" aria-label="Loading cart">
            <div className="space-y-2">
              <Skeleton className="h-8 w-44" />
              <Skeleton className="h-4 w-72 max-w-full" />
            </div>
            <div className="space-y-3">
              {Array.from({ length: 2 }).map((_, index) => (
                <Skeleton key={index} className="h-32 rounded-lg" />
              ))}
            </div>
            <Skeleton className="ml-auto h-44 w-full max-w-sm rounded-lg" />
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

        {/* Cancelled-checkout notice — calm, reassuring, distinct from a hard error */}
        {showCancelNotice && (
          <Alert className="mb-6 border-primary/30 bg-primary/5" role="status">
            <Info className="h-4 w-4 text-primary" />
            <AlertDescription className="flex items-start justify-between gap-4">
              <span className="text-foreground">
                <span className="font-medium">Checkout cancelled — no charge was made.</span> Your
                cart is saved exactly as you left it. Pick up whenever you're ready.
              </span>
              <button
                type="button"
                onClick={dismissCancelNotice}
                aria-label="Dismiss"
                className="-mr-3 -mt-3 inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <X className="h-4 w-4" />
              </button>
            </AlertDescription>
          </Alert>
        )}

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
                fulfillment={fulfillment.fulfillmentByItemId[item.id] ?? 'payable'}
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
                fulfillment={fulfillment}
                capacityUnavailable={Boolean(capacityError)}
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
