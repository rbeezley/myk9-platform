/**
 * Where "Continue Shopping" goes (MYK9-509).
 *
 * The cart page and the checkout-cancel page both offer it, and both used to
 * send the exhibitor to the show's public page. From there the only way back
 * to the entry they were halfway through was to start the wizard over, which
 * is exactly what the tester reported: "it looked like Ziva had not been
 * entered." The wizard now rehydrates its own draft, so the honest destination
 * is the wizard for that show — the existing surface, with the retained
 * selections visible and amendable. No second editor.
 *
 * Return to Cart is untouched: it is still the path that reloads the saved
 * cart and offers checkout again.
 */

export function continueShoppingTarget(showId: string | null | undefined): string {
  return showId ? `/shows/${showId}/register` : '/shows';
}
