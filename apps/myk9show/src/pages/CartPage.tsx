/**
 * Cart Page
 *
 * Full cart review page where exhibitors can review all cart items,
 * modify entries, and proceed to checkout.
 */

import { useCallback, useState, useEffect, useMemo, useRef } from 'react';
import { continueShoppingTarget } from '@/features/registration/continueShoppingTarget';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { ClipboardList, ArrowLeft, Trash2, AlertCircle, Eye, Info, X } from 'lucide-react';
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
import { hasPendingCartMutations } from '@/store/cartStore.helpers';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useExhibitorProfile } from '@/hooks/useExhibitorProfile';
import { CartItemCard } from '@/components/cart/CartItemCard';
import { CartSummary } from '@/components/cart/CartSummary';
import { startCartCheckout } from '@/features/payments/startCartCheckout';
import { CART_ERROR } from './cartErrorCopy';
import { useCartPageError } from './useCartPageError';
import { CHECKOUT_RETURN_PARAM, readCheckoutReturnStatus } from './cartCheckoutNotice';
import { CHECKOUT_HOLD_ENDED_MESSAGE, checkoutHoldEnded } from '@/features/payments/checkoutHold';
import { useCartCapacity } from '@/hooks/queries/useCartCapacity';
import {
  ClosedClassRemovedNotice,
  PaymentLinkNotice,
} from '@/components/cart/ClosedClassRemovedNotice';
import { paymentLinkKey } from '@/store/cartStore.paymentLink';
import {
  areAllCartItemsRecovered,
  buildCartFulfillmentView,
} from '@/features/payments/cartFulfillmentView';
import {
  ENTRY_SCOPE_ENTRIES_PARAM,
  ENTRY_SCOPE_SHOW_PARAM,
} from '@/features/payments/entryScopeParams';

export default function CartPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuthContext();
  const { profile, isLoading: isProfileLoading } = useExhibitorProfile();
  const cart = useCartStore(state => state.cart);
  const items = useCartItems();
  const isCartLoading = useCartStore(state => state.isLoading);
  const loadInitiated = useCartStore(state => state.loadInitiated);
  const { error, setError } = useCartPageError();
  const removeItem = useCartStore(state => state.removeItem);
  const clearCart = useCartStore(state => state.clearCart);
  const loadActiveCart = useCartStore(state => state.loadActiveCart);
  const checkoutWithWaitlist = useCartStore(state => state.checkoutWithWaitlist);
  const {
    judgeDays,
    classSpots,
    waitlistClassIds,
    judgeNameById,
    isLoading: isCapacityLoading,
    isFetching: isCapacityFetching,
    error: capacityError,
    refetch: refetchCapacity,
  } = useCartCapacity(cart?.show_id);

  const [removingItemId, setRemovingItemId] = useState<string | null>(null);
  const [removalAnnouncement, setRemovalAnnouncement] = useState('');
  const entriesHeadingRef = useRef<HTMLHeadingElement>(null);
  const announcementSeqRef = useRef(0);
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  // Imperative in-flight latch: the disabled={isCheckingOut} prop lags one
  // render, so two clicks in the same frame would start two checkout
  // sessions. Deliberately NOT released on the successful redirect path —
  // the page is navigating away to Stripe.
  const checkoutInFlightRef = useRef(false);
  const [cancelNoticeDismissed, setCancelNoticeDismissed] = useState(false);

  // Back from Stripe can restore this page from the back/forward cache with
  // the redirect latch still held; release it so Pay, Remove and Clear work.
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      checkoutInFlightRef.current = false;
      setIsCheckingOut(false);
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  // The cart is NOT necessarily untouched on a cancelled return. A split
  // checkout commits waitlist rows and removes those lines from the cart
  // BEFORE redirecting to Stripe (see handleCheckout), so an exhibitor who
  // abandons payment comes back to a smaller cart. The banner therefore
  // promises only what is always true - no charge - and never that the cart
  // is unchanged.
  const showCancelNotice =
    readCheckoutReturnStatus(searchParams) === 'cancelled' && !cancelNoticeDismissed;
  // Read once on arrival: a return after the hold ended says so (MYK9-1012).
  const [holdEnded] = useState(() => checkoutHoldEnded(Date.now()));

  const dismissCancelNotice = () => {
    setCancelNoticeDismissed(true);
    // Strip the param so a refresh or back-nav doesn't resurrect the banner.
    const next = new URLSearchParams(searchParams);
    next.delete(CHECKOUT_RETURN_PARAM);
    setSearchParams(next, { replace: true });
  };

  // MYK9-122: the cart, its totals, and checkout must all be driven by ONE
  // rule. This is the same split checkout runs — computed here so a full class
  // reads as a waitlist request up front instead of looking payable, moving
  // the total, and then disappearing once checkout routes it to the waitlist.
  // `null` while capacity is loading or errored: unknown availability must not
  // be presented as a final amount.
  // A query gated by `enabled` is not "resolved" just because it is not
  // loading: with no showId, useCartCapacity is disabled and reports
  // isLoading:false / isFetching:false / error:null while returning an empty
  // judgeDays array. Treating that as settled would read "never asked" as
  // "this show has no capacity limits" and mark every line payable. Require
  // that the query was actually asked. (Same class of bug as PR #1697.)
  const capacityQueried = Boolean(cart?.show_id);
  // `isCheckingOut` deliberately keeps the last resolved view on screen. The
  // submit-time refetch sets isFetching, which would otherwise flip the summary
  // to capacityUnknown at the exact instant Pay is pressed: waitlist badges
  // vanish, their lines flip from "Pending" to a dollar figure, and the Total
  // blanks to "Pending" - the summary contradicting itself at the highest-stakes
  // moment. The button already reads "Processing...", and the refetch result
  // replaces this view a moment later either way.
  const capacityResolved =
    capacityQueried &&
    !isCapacityLoading &&
    (!isCapacityFetching || isCheckingOut) &&
    !capacityError;
  const fulfillment = useMemo(
    () =>
      buildCartFulfillmentView(
        items,
        capacityResolved ? judgeDays : null,
        classSpots,
        waitlistClassIds
      ),
    [items, judgeDays, classSpots, capacityResolved, waitlistClassIds]
  );

  // Param names come from the shared module `buildFinishPaymentHref` writes,
  // so a rename cannot reach the producer without reaching this reader.
  const recoveryShowId = searchParams.get(ENTRY_SCOPE_SHOW_PARAM) ?? undefined;
  const recoveryEntryIdsParam = searchParams.get(ENTRY_SCOPE_ENTRIES_PARAM) ?? '';
  const recoveryEntryIds = useMemo(
    () =>
      recoveryEntryIdsParam
        .split(',')
        .map(id => id.trim())
        .filter(Boolean),
    [recoveryEntryIdsParam]
  );
  const linkKey = useMemo(() => paymentLinkKey(recoveryEntryIds), [recoveryEntryIds]);

  // Redirect if not authenticated
  useEffect(() => {
    if (!user) {
      navigate('/sign-in', { state: { from: '/cart' } });
    }
  }, [user, navigate]);

  // Hydrate the active cart on direct visits (refresh, deep link, new tab) —
  // the store is in-memory only, so without this the page always shows empty
  // unless the same tab just populated it (2026-06-10 walkthrough finding).
  // The same load re-runs a payment link's refill of an empty cart (MYK9-873), so
  // the link notice's "add back" calls it too.
  const profileId = profile?.id;
  const loadCartForPage = useCallback(() => {
    if (!profileId) return;
    const cartLoadOptions: {
      showId?: string;
      recoveryEntryIds?: string[];
    } = { recoveryEntryIds };

    if (recoveryShowId) {
      cartLoadOptions.showId = recoveryShowId;
    }

    void loadActiveCart(profileId, cartLoadOptions);
  }, [profileId, loadActiveCart, recoveryShowId, recoveryEntryIds]);

  useEffect(() => {
    loadCartForPage();
  }, [loadCartForPage]);

  const handleRemoveItem = async (itemId: string) => {
    // MYK9-2340: once checkout has started Stripe prices the cart as it is.
    if (checkoutInFlightRef.current) return;
    const removed = items.find(item => item.id === itemId);
    setRemovingItemId(itemId);
    setError(null);

    const success = await removeItem(itemId);
    if (!success) setError(CART_ERROR.removeFailed);

    if (success) {
      const wasLastItem = items.length <= 1;

      // The card holding the focused Remove button just unmounted, which drops
      // focus to <body> and restarts a keyboard user's Tab order at the top of
      // the document. Send focus to the entry-count heading - it is the thing
      // that changed, and it reads the new count aloud. Removing the LAST item
      // swaps the page for the empty-cart branch, where that heading does not
      // exist, so there is nothing to focus and the announcement has to carry
      // the whole message on its own.
      if (!wasLastItem) {
        entriesHeadingRef.current?.focus();
      }

      // Nothing else announces this: the subtotal, fee, total and the Pay
      // button's own label all change silently, on a money screen. The counter
      // suffix forces a re-read when two removals produce identical text (two
      // unnamed entries both yield "Removed entry."), which a live region
      // otherwise ignores as an unchanged value.
      const what = `${removed?.dog?.call_name ?? 'entry'}${
        removed?.class?.name ? ` from ${removed.class.name}` : ''
      }`;
      announcementSeqRef.current += 1;
      setRemovalAnnouncement(
        `Removed ${what}.${wasLastItem ? ' Your entry is now empty.' : ''}${'\u200b'.repeat(
          announcementSeqRef.current % 2
        )}`
      );
    }

    setRemovingItemId(null);
  };

  const handleClearCart = async () => {
    if (checkoutInFlightRef.current) return;
    setIsClearing(true);
    setError(null);
    if (!(await clearCart())) setError(CART_ERROR.clearFailed);
    setIsClearing(false);
    setShowClearDialog(false);
  };

  const stopCheckingOut = () => {
    checkoutInFlightRef.current = false;
    setIsCheckingOut(false);
  };

  const handleCheckout = async () => {
    if (checkoutInFlightRef.current) return;
    // MYK9-2340: a queued edit (a second removal) has not reached the database
    // yet; paying now would charge the cart as it was before it.
    if (hasPendingCartMutations(cart?.id)) return;
    if (!cart?.id) {
      setError('No entry found. Please add a class to your entry.');
      return;
    }
    if (!profile?.id) {
      setError('Could not verify your account. Please sign in again.');
      return;
    }
    // A Stripe session is cart-wide. Skip the capacity dependency only when
    // every line is an already-submitted entry; a mixed cart must stay fail
    // closed so a new line is never charged while availability is unknown.
    const onlyRecoveredItems = areAllCartItemsRecovered(items);

    if (!onlyRecoveredItems && (isCapacityLoading || isCapacityFetching)) {
      setError('Class availability is still loading. Please try checkout again in a moment.');
      return;
    }
    if (!onlyRecoveredItems && capacityError) {
      setError('Could not verify class availability right now. Please try again.');
      return;
    }

    checkoutInFlightRef.current = true;
    setIsCheckingOut(true);
    setError(null);

    // MYK9-1964: the same checks and session creation the wizard's card Pay
    // runs. The submit-time capacity re-check reads through this page's query
    // so the summary updates with what it found. refetch() resolves with the
    // error inside the result, and on failure `fresh.data` still holds the
    // last SUCCESSFUL payload, so a failed read is reported as null, never
    // handed back as though availability had been confirmed.
    const outcome = await startCartCheckout({
      cart,
      items,
      exhibitorProfileId: profile.id,
      readCapacity: async () => {
        const fresh = await refetchCapacity();
        return fresh.isError || !fresh.data ? null : fresh.data;
      },
      judgeNameById,
      checkoutWithWaitlist,
      removeItem,
    });

    // Stripe's page is loading: the latch is deliberately left held.
    if (outcome.kind === 'redirecting') return;

    if (outcome.kind === 'waitlistOnly') {
      stopCheckingOut();
      navigate(outcome.path);
      return;
    }

    // The 409 re-pricing case looped forever before the reload below: the
    // server heals the stored cart, but the client kept re-sending the stale
    // in-memory copy.
    if (outcome.status === 409) {
      // Re-hydrate so "review your cart" is actually possible - with the same
      // options as the mount-time load. An empty object drops the recovery
      // showId, and cartStore then falls back to "most recently created
      // active cart", which for someone who arrived via /cart?showId=X on an
      // older cart would silently swap them onto a different show's cart
      // underneath a 409 about the one they were paying for.
      const reloadOptions: Parameters<typeof loadActiveCart>[1] = {};
      if (recoveryShowId) {
        reloadOptions.showId = recoveryShowId;
      }
      // Awaited before the latch is released. Fire-and-forget left the cart
      // visible with its stale in-memory fees while the reload was still in
      // flight, so a quick retry re-submitted exactly the same stale cart and
      // earned another 409 - the loop this fix exists to break.
      await loadActiveCart(profile.id, reloadOptions);
      // A class that filled at Pay (MYK9-1012) must read as full on the
      // reloaded cart, with its waitlist option, not as payable.
      await refetchCapacity();
    }

    setError(outcome.message);
    stopCheckingOut();
  };

  const handleContinueShopping = () => {
    navigate(continueShoppingTarget(cart?.show_id));
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

  // Rendered by every branch below, deliberately. Removing the last item flips
  // the page to the empty-cart branch, so a live region living inside the
  // items.length > 0 return unmounted before it could speak - silently losing
  // the announcement in the single-entry case, which is the common one.
  // Rendered as the FIRST child of the same root element in every branch
  // below. All three branches return the same root element type, so React
  // reconciles this <p> in place rather than unmounting it when the cart
  // empties - which matters because screen readers announce CHANGES to a live
  // region that is already mounted, not the initial content of a region that
  // has just appeared. A region that mounts already-populated is silent, so the
  // single-entry removal (the common case) would still say nothing.
  const liveRegion = (
    <p aria-live="polite" className="sr-only">
      {removalAnnouncement}
    </p>
  );

  // Both the cart and the empty-cart branch render it: a payment-link lookup that
  // failed with no cart left lands on the empty branch (MYK9-873).
  const errorAlert = error ? (
    <Alert variant="destructive" className="mb-6">
      <AlertCircle className="h-4 w-4" />
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  ) : null;

  if (isHydrating) {
    return (
      <div className="bg-background pt-6">
        {liveRegion}
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="space-y-6 py-8" role="status" aria-label="Loading your entry">
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
        {liveRegion}
        <div className="max-w-4xl mx-auto px-4 py-8">
          {errorAlert}
          {/* The re-check may have removed every line (MYK9-656): say which and why. */}
          <ClosedClassRemovedNotice />
          <PaymentLinkNotice linkKey={linkKey} onAddBack={loadCartForPage} className="mt-4" />
          <div className="flex flex-col items-center justify-center py-16 text-center">
            {/* --chip-stone-bg, not bg-muted: --muted equals --card and sits at
                1.08:1 on --background, so the circle was a void in both themes
                and a border on it was equally inert. */}
            <div className="w-20 h-20 rounded-full bg-[color:var(--chip-stone-bg)] flex items-center justify-center mb-6">
              <ClipboardList className="h-10 w-10 text-muted-foreground" />
            </div>
            <h1 className="text-2xl font-bold mb-2">Nothing in your entry yet</h1>
            <p className="text-muted-foreground mb-6 max-w-md">
              Browse upcoming shows and pick a show to start your entry.
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
      {liveRegion}
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header. Wraps so Clear Cart drops under the title on a phone instead
            of pushing the page 25px sideways at 390px (MYK9-625). */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <div className="flex min-w-0 items-center gap-4">
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
                <ClipboardList className="h-6 w-6" />
                Your Entry
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
              disabled={isCheckingOut}
              className="min-h-[44px] text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Clear Entry
            </Button>
          )}
        </div>

        {/* Cancelled-checkout notice — calm, reassuring, distinct from a hard error */}
        {showCancelNotice && (
          <Alert className="mb-6 border-primary/30 bg-primary/5" role="status">
            <Info className="h-4 w-4 text-primary" />
            <AlertDescription className="flex items-start justify-between gap-4">
              <span className="text-foreground">
                {/* MYK9-1012: back from a Stripe page that outlived its hold. */}
                {holdEnded ? (
                  <span className="font-medium">{CHECKOUT_HOLD_ENDED_MESSAGE}</span>
                ) : (
                  <>
                    <span className="font-medium">
                      Checkout cancelled. Your card was not charged.
                    </span>{' '}
                    Anything still in your entry is below.
                  </>
                )}{' '}
                Any waitlist requests you made are saved under{' '}
                <Link to="/exhibitor/entries" className="text-primary hover:underline">
                  My Shows
                </Link>
                .
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

        {/* Classes a saved cart lost because they closed or filled (MYK9-656) */}
        <ClosedClassRemovedNotice className="mb-6" />
        {/* What the payment link in the URL came to (MYK9-873) */}
        <PaymentLinkNotice linkKey={linkKey} onAddBack={loadCartForPage} className="mb-6" />

        {errorAlert}

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Cart Items */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold" tabIndex={-1} ref={entriesHeadingRef}>
                {items.length} {items.length === 1 ? 'Entry' : 'Entries'}
              </h2>
            </div>

            {items.map(item => (
              <CartItemCard
                key={item.id}
                item={item}
                onRemove={() => handleRemoveItem(item.id)}
                isRemoving={removingItemId === item.id}
                removeDisabled={isCheckingOut}
                fulfillment={fulfillment.fulfillmentByItemId[item.id] ?? 'payable'}
                fullReason={fulfillment.fullReasonByItemId.get(item.id)}
                judgeNameById={judgeNameById}
              />
            ))}
          </div>

          {/* Order Summary */}
          <div className="lg:col-span-1">
            <div className="sticky top-[calc(var(--app-top-inset,3rem)+1.5rem)]">
              <CartSummary
                onCheckout={handleCheckout}
                onContinueShopping={handleContinueShopping}
                isCheckingOut={isCheckingOut}
                fulfillment={fulfillment}
                capacityUnavailable={Boolean(capacityError)}
                onRetryCapacity={() => void refetchCapacity()}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Clear Cart Confirmation Dialog */}
      <AlertDialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear entry?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove all {items.length} {items.length === 1 ? 'entry' : 'entries'} from
              your entry. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isClearing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleClearCart}
              disabled={isClearing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isClearing ? 'Clearing...' : 'Clear Entry'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
