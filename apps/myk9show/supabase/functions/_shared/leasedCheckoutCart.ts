import { cartOwnerAddressRefusal, type OwnerAddressGateLine } from './cartOwnerAddressGate.ts';

/**
 * stripe-checkout's step under the checkout lease (MYK9-1012): re-read the
 * cart, then gate THAT snapshot before anything creates or reuses a Checkout
 * Session. The snapshot read here is the one checkout prices and whose
 * `updated_at` guards the later hold and create, so a line added after this
 * read is caught by those version checks, and a line added before it is caught
 * here.
 *
 * MYK9-1010, Codex round 2: the owner-address gate used to judge only the read
 * BEFORE the lease, so an addressless AKC line added between the two reads
 * reached Stripe. The caller's `finally` ends the lease whatever this returns,
 * exactly as for every other under-lease refusal.
 */
export async function checkoutLeasedCart<Cart extends { items: unknown }>(deps: {
  reload: () => PromiseLike<{ data: Cart | null; error: unknown }>;
  proceed: (cart: Cart) => Promise<Response>;
  respond: (body: object, status: number) => Response;
}): Promise<Response> {
  const { data: cart, error } = await deps.reload();
  if (error || !cart) {
    console.error('Cart not found under lease:', error);
    return deps.respond({ error: 'Cart not found or expired' }, 404);
  }
  const addressRefusal = cartOwnerAddressRefusal(cart.items as OwnerAddressGateLine[]);
  if (addressRefusal) return deps.respond(addressRefusal, 422);
  return deps.proceed(cart);
}
