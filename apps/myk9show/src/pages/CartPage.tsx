/**
 * Cart Page
 *
 * Full cart review page where exhibitors can review all cart items,
 * modify entries, and proceed to checkout.
 */

import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ShoppingCart, ArrowLeft, Trash2, AlertCircle } from 'lucide-react';
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
import { useCartStore, useCartItems } from '@/stores/cartStore';
import { useAuthContext } from '@/hooks/useAuthContext';
import { CartItemCard } from '@/components/cart/CartItemCard';
import { CartSummary } from '@/components/cart/CartSummary';
import { createEntryCheckoutSession } from '@/lib/stripe';

export default function CartPage() {
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const cart = useCartStore(state => state.cart);
  const items = useCartItems();
  const error = useCartStore(state => state.error);
  const removeItem = useCartStore(state => state.removeItem);
  const clearCart = useCartStore(state => state.clearCart);
  const setError = useCartStore(state => state.setError);

  const [removingItemId, setRemovingItemId] = useState<string | null>(null);
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  // Redirect if not authenticated
  useEffect(() => {
    if (!user) {
      navigate('/sign-in', { state: { from: '/cart' } });
    }
  }, [user, navigate]);

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

    setIsCheckingOut(true);
    setError(null);

    try {
      // This will redirect to Stripe Checkout
      await createEntryCheckoutSession(cart.id);
      // If we get here, the redirect didn't happen (shouldn't normally occur)
    } catch (err) {
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

  // Empty cart state
  if (!cart || items.length === 0) {
    return (
      <div className="min-h-screen bg-background pt-20">
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
              Browse Shows
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pt-20">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="default" onClick={() => navigate(-1)} className="gap-1">
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
              className="text-muted-foreground hover:text-destructive"
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
