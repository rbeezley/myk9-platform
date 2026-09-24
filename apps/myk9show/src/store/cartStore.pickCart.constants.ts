/**
 * The recoverable-cart lookup's wire shape (MYK9-650). Dependency-free so the
 * Playwright route stubs can import it and match the request the app really
 * sends, instead of a copy of the string that drifts.
 */

/** Terminal carts (submitted / abandoned) are never recovered. */
export const RECOVERABLE_CART_STATUSES = ['active', 'expired'] as const;

/**
 * The lookup's column list. `entry_cart_items(count)` is the same embedded
 * count the badge has always used; the items' RLS is scoped to the viewer's own
 * carts, so it counts exactly the rows `/cart` will load.
 */
export const RECOVERABLE_CART_LOOKUP_COLUMNS =
  'id, show_id, status, expires_at, created_at, entry_cart_items(count)';

/** The `select` query parameter as supabase-js serialises it (whitespace stripped). */
export const RECOVERABLE_CART_LOOKUP_SELECT_PARAM = RECOVERABLE_CART_LOOKUP_COLUMNS.replace(
  /\s/g,
  ''
);
