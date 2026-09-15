/**
 * Checkout Cancel Page
 *
 * Displayed when Stripe returns the exhibitor to our cancel_url. Offers options
 * to return to the cart or continue shopping.
 *
 * MYK9-509: the cancel_url is ALSO reachable after a successful payment — Back
 * from the receipt, a restored tab, a re-followed history entry. So the landing
 * verifies its `session_id` before claiming anything: a paid session gets the
 * receipt, never "Payment Cancelled" and never the amend button, which leads
 * one click into a live cart. The rule lives in `CheckoutCancelPage.session`.
 */

import { useNavigate } from 'react-router-dom';
import { XCircle, CheckCircle, ShoppingCart, ArrowLeft, ArrowRight, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { useCartStore, useCartItems } from '@/store/cartStore';
import { continueShoppingTarget } from '@/features/registration/continueShoppingTarget';
import { useCancelledCheckoutSession } from './CheckoutCancelPage.session';

export default function CheckoutCancelPage() {
  const navigate = useNavigate();
  const cart = useCartStore(state => state.cart);
  // A real Stripe cancel returns via a full document load, so `cart` is null
  // here and only the persisted recovery ids survive. Reading them is what
  // makes the entry-amendment button reachable in the normal flow instead of
  // only after an in-app navigation.
  const recoveryShowId = useCartStore(state => state.cartRecoveryInfo?.showId ?? null);
  const returnShowId = cart?.show_id ?? recoveryShowId;
  const items = useCartItems();
  const itemCount = items.length;

  const { status: sessionStatus, sessionId } = useCancelledCheckoutSession();

  if (sessionStatus === 'paid') {
    return (
      <div className="bg-background pt-6">
        <div className="max-w-2xl mx-auto px-4 py-16">
          <Card>
            <CardHeader className="text-center pb-2">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="h-8 w-8 text-muted-foreground" />
              </div>
              <CardTitle className="text-2xl">This payment went through</CardTitle>
              <p className="text-muted-foreground mt-2">
                You landed on the cancelled-payment page, but this checkout was already paid. You
                have not been charged again.
              </p>
            </CardHeader>

            <CardContent>
              <div className="text-sm text-muted-foreground p-4 rounded-lg bg-muted/30">
                Open the receipt for your confirmation number and the entries it covers.
              </div>
            </CardContent>

            <CardFooter className="flex-col gap-2">
              {/*
                INTENT: MYK9-509 — the ONLY action offered here is the receipt.
                No "Return to Cart" and no "Add or change entries": both walk a
                paid exhibitor back into a cart they could pay for a second time.
              */}
              <Button
                className="w-full"
                onClick={() => navigate(`/checkout/success?session_id=${sessionId ?? ''}`)}
              >
                <ArrowRight className="h-4 w-4 mr-2" />
                View your receipt
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    );
  }

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
            {/*
              INTENT: Always offer Return to Cart, even when itemCount === 0.
              After a real Stripe cancel the browser does a full-page return, and the
              cart store only persists cartRecoveryInfo (ids) — not cart.items — so
              itemCount is 0 here. CartPage re-hydrates items via loadActiveCart on
              mount, so /cart?checkout=cancelled lands on a populated cart and shows
              the calm "checkout cancelled, your cart is saved" banner. Gating this
              button on itemCount made that banner unreachable in the normal flow.
            */}
            <Button className="w-full" onClick={() => navigate('/cart?checkout=cancelled')}>
              <ShoppingCart className="h-4 w-4 mr-2" />
              Return to Cart
            </Button>
            {returnShowId ? (
              /*
                INTENT: MYK9-509 — this goes to the WIZARD for the show, not the
                show's public page. A cancelled checkout leaves the exhibitor's
                dog and class selections intact in the saved draft, and the
                wizard rehydrates them on mount, so this is the one place where
                "add another class for Ziva" is possible without starting over.
                The label says where it goes.

                Suppressed while a session id is still being verified: until the
                answer is in, this button may be offering a second payment for a
                checkout that already succeeded.
              */
              <Button
                variant="outline"
                className="w-full"
                disabled={sessionStatus === 'checking'}
                onClick={() => navigate(continueShoppingTarget(returnShowId))}
              >
                <ArrowRight className="h-4 w-4 mr-2" />
                Add or change entries
              </Button>
            ) : (
              <Button variant="outline" className="w-full" onClick={() => navigate('/shows')}>
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
