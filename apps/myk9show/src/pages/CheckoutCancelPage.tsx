/**
 * Checkout Cancel Page
 *
 * Displayed when user cancels payment on Stripe checkout.
 * Offers options to return to cart or continue shopping.
 */

import { useNavigate } from 'react-router-dom';
import { XCircle, ShoppingCart, ArrowLeft, ArrowRight, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { useCartStore, useCartItems } from '@/stores/cartStore';

export default function CheckoutCancelPage() {
  const navigate = useNavigate();
  const cart = useCartStore(state => state.cart);
  const items = useCartItems();
  const itemCount = items.length;

  return (
    <div className="bg-background pt-6">
      <div className="max-w-2xl mx-auto px-4 py-16">
        <Card>
          <CardHeader className="text-center pb-2">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <XCircle className="h-8 w-8 text-muted-foreground" />
            </div>
            <CardTitle className="text-2xl">Payment Cancelled</CardTitle>
            <p className="text-muted-foreground mt-2">
              Your payment was not completed. Don't worry - your cart has been saved.
            </p>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Cart Status */}
            {itemCount > 0 && (
              <div className="flex items-center gap-3 p-4 rounded-lg border bg-muted/30">
                <ShoppingCart className="h-5 w-5 text-muted-foreground" />
                <div className="flex-1">
                  <p className="font-medium">Your cart is waiting</p>
                  <p className="text-sm text-muted-foreground">
                    {itemCount} {itemCount === 1 ? 'entry' : 'entries'} still in your cart
                  </p>
                </div>
              </div>
            )}

            {/* Helpful Info */}
            <div className="text-sm text-muted-foreground p-4 rounded-lg bg-muted/30">
              <p className="font-medium text-foreground mb-2">Need help?</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Your selections are saved for 30 minutes</li>
                <li>You can return to checkout anytime</li>
                <li>If you experienced an issue, try again or contact support</li>
              </ul>
            </div>
          </CardContent>

          <CardFooter className="flex-col gap-2">
            {itemCount > 0 ? (
              <>
                <Button className="w-full" onClick={() => navigate('/cart')}>
                  <ShoppingCart className="h-4 w-4 mr-2" />
                  Return to Cart
                </Button>
                {cart?.show_id && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => navigate(`/shows/${cart.show_id}`)}
                  >
                    <ArrowRight className="h-4 w-4 mr-2" />
                    Continue Shopping
                  </Button>
                )}
              </>
            ) : (
              <Button className="w-full" onClick={() => navigate('/shows')}>
                <Eye className="h-4 w-4 mr-2" />
                Browse Shows
              </Button>
            )}
            <Button variant="ghost" className="w-full" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Go Back
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
