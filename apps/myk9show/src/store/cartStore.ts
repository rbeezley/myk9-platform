/**
 * Cart Store
 *
 * Manages shopping cart state for entry submissions.
 * Uses Zustand with localStorage persistence for cart recovery.
 *
 * Following patterns from myK9Qv3 entryStore and existing stores in this codebase.
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { supabase } from '@/lib/supabase';
import { logger } from '@/services/LoggingService';
import { ensureError } from '@myk9/core';
import { onAccountBoundary } from '@/lib/accountBoundary';

import type {
  CartState,
  CartWithDetails,
  CartItemWithDetails,
  NewCartItem,
  EntryCartInsert,
  EntryCartItemInsert,
  EntryCartItem,
  WaitlistEntryResult,
  CheckoutResult,
} from './cartStore.types';

import {
  CART_EXPIRATION_MINUTES,
  EXPIRATION_WARNING_MINUTES,
  calculateCartTotals,
} from './cartStore.helpers';
import {
  findRecoverableEntries,
  loadCartItemsByCartId,
  recoverCartItemsFromEntryIds,
} from './cartStore.recovery';
import type { RecoverableEntryRow } from './cartStore.recovery';
import { reconcileCartItemsAgainstExistingEntries } from './cartStore.reconciliation';
import {
  ensureCartOnce,
  isActiveCartUniqueViolation,
  resetEnsureCartInFlight,
} from './cartStore.ensureCart';
import { captureCartWriteGuard, guardedSet, invalidateCartWrites } from './cartStore.session';
import { recoverCartHold, type RecoverableCartRow } from './cartStore.recoverHold';
import { findRecoverableCart } from './cartStore.pickCart';
import { dropItemsInClosedClasses, mergeDroppedItems } from './cartStore.classClosure';

// Re-export types so existing imports continue to work
export type {
  CartStatus,
  CartItemWithDetails,
  CartWithDetails,
  EnsureCartResult,
  NewCartItem,
  WaitlistEntryResult,
  CheckoutResult,
} from './cartStore.types';

const recoveryCartInFlight = new Map<string, Promise<CartWithDetails | null>>();
export const useCartStore = create<CartState>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial state
        cart: null,
        isLoading: false,
        loadInitiated: false,
        error: null,
        lastSyncedAt: null,
        expirationWarning: false,
        droppedClosedClassItems: [],

        // Load existing cart for a show
        loadCart: async (showId: string, exhibitorId: string) => {
          const guard = captureCartWriteGuard();
          const write = guardedSet<CartState>(set, guard);
          write({ isLoading: true, error: null });

          try {
            // Use order + limit(1) so duplicate active carts (e.g. from React
            // StrictMode double-invoke) don't cause maybeSingle() to throw.
            const { data: cartData, error: cartError } = await supabase
              .from('entry_carts')
              .select(`*, show:shows(id, name, start_date, entry_close_date)`)
              .eq('show_id', showId)
              .eq('exhibitor_id', exhibitorId)
              .eq('status', 'active')
              .gt('expires_at', new Date().toISOString())
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();

            if (cartError) {
              logger.error('Error loading cart', 'cartStore', { showId, exhibitorId }, cartError);
              throw cartError;
            }

            if (!cartData) {
              write({ cart: null, isLoading: false });
              return null;
            }

            const { data: itemsData, error: itemsError } = await supabase
              .from('entry_cart_items')
              .select(
                `*, dog:dogs(id, name, call_name, registrations:dog_registrations(id, created_at, breed)), class:classes(id, name, level, trial_id, allow_waitlist), handler:people(id, first_name, last_name)`
              )
              .eq('cart_id', cartData.id);

            if (itemsError) {
              logger.error(
                'Error loading cart items',
                'cartStore',
                { cartId: cartData.id },
                itemsError
              );
              throw itemsError;
            }

            const closure = await dropItemsInClosedClasses({
              cartId: cartData.id,
              items: await reconcileCartItemsAgainstExistingEntries({
                cartId: cartData.id,
                showId,
                items: (itemsData || []) as CartItemWithDetails[],
              }),
            });
            const items = closure.items;
            const { subtotal, platformFee, total } = calculateCartTotals(items);

            const cartWithDetails: CartWithDetails = {
              ...cartData,
              subtotal_cents: subtotal,
              platform_fee_cents: platformFee,
              total_cents: total,
              items,
              show: cartData.show as CartWithDetails['show'],
            };

            write({
              cart: cartWithDetails,
              isLoading: false,
              lastSyncedAt: new Date().toISOString(),
              droppedClosedClassItems: mergeDroppedItems(
                get().droppedClosedClassItems,
                closure.dropped,
                cartData.id
              ),
            });

            const timeUntilExpiry = get().getTimeUntilExpiration();
            if (
              timeUntilExpiry !== null &&
              timeUntilExpiry < EXPIRATION_WARNING_MINUTES * 60 * 1000
            ) {
              write({ expirationWarning: true });
            }

            return cartWithDetails;
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to load cart';
            write({ error: message, isLoading: false });
            logger.error(
              'Failed to load cart',
              'cartStore',
              { showId, exhibitorId },
              ensureError(error)
            );
            return null;
          }
        },

        // Load the most recent recoverable cart regardless of show — lets
        // /cart be visited directly (deep link, refresh, new tab). Recovery
        // deliberately excludes submitted/abandoned carts; those are terminal.
        loadActiveCart: async (exhibitorId: string, options = {}) => {
          const guard = captureCartWriteGuard(options.isCurrent);
          const write = guardedSet<CartState>(set, guard);
          write({ isLoading: true, error: null, loadInitiated: true });

          // The newest openable cart WITH items, not merely the newest (MYK9-650).
          const lookup = await findRecoverableCart({ exhibitorId, showId: options.showId });
          if (lookup.kind === 'error') {
            logger.error(
              'Error finding active cart',
              'cartStore',
              { exhibitorId },
              ensureError(lookup.error)
            );
            write({ cart: null, isLoading: false });
            return null;
          }
          let data: RecoverableCartRow | null = lookup.kind === 'found' ? lookup.cart : null;
          let recoverableEntriesForCart: RecoverableEntryRow[] | undefined;
          if (!data) {
            // A submitted unpaid entry may no longer have the cart shell that
            // originally created it. Deep-linked Finish Payment recovery is
            // scoped to explicit entry ids, so create a fresh shell and let
            // the normal exact-entry recovery path hydrate it below.
            if (options.showId && options.recoveryEntryIds?.length) {
              const recoverableEntries = await findRecoverableEntries({
                showId: options.showId,
                exhibitorId,
                entryIds: options.recoveryEntryIds,
              });
              if (recoverableEntries.length > 0) {
                recoverableEntriesForCart = recoverableEntries;
                const recoveryKey = `${exhibitorId}:${options.showId}:${options.recoveryEntryIds
                  .slice()
                  .sort()
                  .join(',')}`;
                let recoveryPromise = recoveryCartInFlight.get(recoveryKey);
                if (!recoveryPromise) {
                  recoveryPromise = get().createCart(options.showId, exhibitorId, {
                    isCurrent: guard,
                  });
                  recoveryCartInFlight.set(recoveryKey, recoveryPromise);
                }
                let recoveryCart: CartWithDetails | null;
                try {
                  recoveryCart = await recoveryPromise;
                } finally {
                  if (recoveryCartInFlight.get(recoveryKey) === recoveryPromise) {
                    recoveryCartInFlight.delete(recoveryKey);
                  }
                }
                if (recoveryCart) {
                  data = {
                    id: recoveryCart.id,
                    show_id: recoveryCart.show_id,
                    status: recoveryCart.status,
                    expires_at: recoveryCart.expires_at,
                  };
                }
              }
            }

            if (!data) {
              write({ cart: null, isLoading: false });
              return null;
            }
          }

          let recoveredExpiresAt = data.expires_at;
          let recoveredSessionId: string | null | undefined;
          const expiresAtMs = data.expires_at ? new Date(data.expires_at).getTime() : null;
          const needsRecovery =
            data.status === 'expired' || (expiresAtMs !== null && expiresAtMs <= Date.now());

          if (needsRecovery) {
            // Reactivates the row as well as extending the hold: an 'expired'
            // row is outside the partial unique index, so leaving it there lets
            // a second createCart insert a rival empty cart that then wins every
            // `created_at desc` read (review C P2-1).
            const recovered = await recoverCartHold(data, exhibitorId);
            if (recovered.kind === 'failed') {
              write({ cart: null, isLoading: false });
              return null;
            }
            data = recovered.row;
            recoveredExpiresAt = recovered.expiresAt;
            recoveredSessionId = null;
          }

          const { data: cartData, error: cartError } = await supabase
            .from('entry_carts')
            .select(`*, show:shows(id, name, start_date, entry_close_date)`)
            .eq('id', data.id)
            .eq('exhibitor_id', exhibitorId)
            .in('status', ['active', 'expired'])
            .limit(1)
            .maybeSingle();

          if (cartError) {
            logger.error('Error loading recovered cart', 'cartStore', { exhibitorId }, cartError);
            write({ cart: null, isLoading: false });
            return null;
          }

          if (!cartData) {
            write({ cart: null, isLoading: false });
            return null;
          }

          let items: CartItemWithDetails[];
          try {
            items = await loadCartItemsByCartId(cartData.id);
          } catch (error) {
            logger.error(
              'Error loading recovered cart items',
              'cartStore',
              { cartId: cartData.id },
              ensureError(error)
            );
            write({ cart: null, isLoading: false });
            return null;
          }

          // Exact-entry recovery rebuilds only the explicit unpaid entries. It
          // never sweeps unrelated pending entries into checkout or backfills a
          // partially emptied cart.
          if (items.length === 0 && options.recoveryEntryIds?.length) {
            items = await recoverCartItemsFromEntryIds({
              cartId: cartData.id,
              showId: cartData.show_id,
              exhibitorId,
              entryIds: options.recoveryEntryIds,
              ...(recoverableEntriesForCart
                ? { recoverableEntries: recoverableEntriesForCart }
                : {}),
            });
          }

          // A recovered draft may be months old: drop classes that closed or filled since.
          const closure = await dropItemsInClosedClasses({
            cartId: cartData.id,
            items: await reconcileCartItemsAgainstExistingEntries({
              cartId: cartData.id,
              showId: cartData.show_id,
              items,
            }),
          });
          items = closure.items;

          const { subtotal, platformFee, total } = calculateCartTotals(items);
          const cartWithDetails: CartWithDetails = {
            ...cartData,
            expires_at: recoveredExpiresAt,
            stripe_checkout_session_id: recoveredSessionId ?? cartData.stripe_checkout_session_id,
            subtotal_cents: subtotal,
            platform_fee_cents: platformFee,
            total_cents: total,
            items,
            show: cartData.show as CartWithDetails['show'],
          };

          write({
            cart: cartWithDetails,
            isLoading: false,
            lastSyncedAt: new Date().toISOString(),
            expirationWarning: false,
            droppedClosedClassItems: mergeDroppedItems(
              get().droppedClosedClassItems,
              closure.dropped,
              cartData.id
            ),
          });

          return cartWithDetails;
        },

        /**
         * The wizard's opener: recover this exhibitor's cart for the show, or
         * create one — as a single coalesced unit, resolving `ready` or
         * `failed` and never nothing-with-no-reason (MYK9-581).
         */
        ensureCart: (showId: string, exhibitorId: string) => {
          // A failure reported after the user changed must not land either.
          const write = guardedSet<CartState>(set, captureCartWriteGuard());
          return ensureCartOnce(showId, exhibitorId, {
            loadActiveCart: (exhibitorIdArg, options) =>
              get().loadActiveCart(exhibitorIdArg, options),
            createCart: (showIdArg, exhibitorIdArg, options) =>
              get().createCart(showIdArg, exhibitorIdArg, options),
            // `createCart` logs and swallows its PostgREST error, leaving the
            // message on the store; reading it back is the only way the opener's
            // own log line can name the real failure (review C P3-1).
            lastError: () => get().error,
            // The store's own record of the same failure the caller is handed.
            // `loadActiveCart` clears `isLoading` on every exit it owns, but a
            // throw escapes before that, so clearing it here is what keeps a
            // rejected entries-reconcile read from leaving the step mid-load.
            onFailure: (message: string, cause?: unknown) => {
              write({ error: message, isLoading: false });
              logger.error(
                'Failed to open cart',
                'cartStore',
                { showId, exhibitorId },
                ensureError(cause ?? new Error(message))
              );
            },
          });
        },

        // Create a new cart
        createCart: async (showId: string, exhibitorId: string, options = {}) => {
          const guard = captureCartWriteGuard(options.isCurrent);
          const write = guardedSet<CartState>(set, guard);
          write({ isLoading: true, error: null });

          try {
            const expiresAt = new Date(
              Date.now() + CART_EXPIRATION_MINUTES * 60 * 1000
            ).toISOString();

            const cartInsert: EntryCartInsert = {
              show_id: showId,
              exhibitor_id: exhibitorId,
              status: 'active',
              expires_at: expiresAt,
              subtotal_cents: 0,
              platform_fee_cents: 0,
              total_cents: 0,
            };

            const { data: cartData, error: cartError } = await supabase
              .from('entry_carts')
              .insert(cartInsert)
              .select(`*, show:shows(id, name, start_date, entry_close_date)`)
              .single();

            if (cartError) {
              // Another tab won the race for this (show, exhibitor): the row
              // the index is protecting is this exhibitor's own cart. RECOVER
              // it — `loadActiveCart` reads `status IN ('active','expired')`
              // with no expiry filter, extends a lapsed hold by id and keeps
              // the items. Expiring it and inserting a fresh empty shell in its
              // place is what orphaned a drafted cart. Matched by index NAME so
              // a violation of some other constraint still surfaces.
              if (isActiveCartUniqueViolation(cartError)) {
                logger.warn(
                  'Active cart already exists for this show; recovering it instead',
                  'cartStore',
                  { showId, exhibitorId }
                );
                return get().loadActiveCart(exhibitorId, { showId, isCurrent: guard });
              }
              logger.error('Error creating cart', 'cartStore', { showId, exhibitorId }, cartError);
              throw cartError;
            }

            const cartWithDetails: CartWithDetails = {
              ...cartData,
              items: [],
              show: cartData.show as CartWithDetails['show'],
            };

            write({
              cart: cartWithDetails,
              isLoading: false,
              lastSyncedAt: new Date().toISOString(),
              expirationWarning: false,
            });

            return cartWithDetails;
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to create cart';
            write({ error: message, isLoading: false });
            logger.error(
              'Failed to create cart',
              'cartStore',
              { showId, exhibitorId },
              ensureError(error)
            );
            return null;
          }
        },

        // Add item to cart
        addItem: async (item: NewCartItem) => {
          const guard = captureCartWriteGuard();
          const write = guardedSet<CartState>(set, guard);
          const { cart } = get();
          if (!cart) {
            // Says WHICH add was dropped and what the store held instead. The
            // bare `write({ error })` was invisible in logs, so a chip clicked
            // before the cart finished loading looked to the exhibitor like a
            // failed add and to us like nothing at all (MYK9-542).
            logger.warn('addItem called with no active cart; the click was dropped', 'cartStore', {
              item,
              loadInitiated: get().loadInitiated,
              isLoading: get().isLoading,
            });
            write({ error: 'No active cart' });
            return false;
          }

          try {
            const itemInsert: EntryCartItemInsert = {
              cart_id: cart.id,
              dog_id: item.dogId,
              class_id: item.classId,
              handler_id: item.handlerId || null,
              entry_fee_cents: item.entryFeeCents,
              jump_height: item.jumpHeight || null,
              special_requests: item.specialRequests || null,
            };

            const { data: newItem, error: insertError } = await supabase
              .from('entry_cart_items')
              .insert(itemInsert)
              .select(
                `*, dog:dogs(id, name, call_name, registrations:dog_registrations(id, created_at, breed)), class:classes(id, name, level, trial_id, allow_waitlist), handler:people(id, first_name, last_name)`
              )
              .single();

            if (insertError) {
              // 23505 on entry_cart_items_unique_dog_class_idx means this cart
              // ALREADY holds this (dog, class): the row is in the DB and the
              // locally-held list had fallen short of it. That is not a failure
              // to add -- the exhibitor's intent is already satisfied. Refresh
              // the list from the DB so local truth matches, and report success
              // (MYK9-530). This needs only a SELECT, which the same FOR ALL
              // policy that allowed the read already grants.
              if (insertError.code === '23505') {
                logger.warn(
                  'Cart item already present; refreshing cart from DB',
                  'cartStore',
                  { cartId: cart.id, item },
                  insertError
                );
                const refreshedItems = await loadCartItemsByCartId(cart.id);
                const refreshedTotals = calculateCartTotals(refreshedItems);
                write({
                  cart: {
                    ...cart,
                    items: refreshedItems,
                    subtotal_cents: refreshedTotals.subtotal,
                    platform_fee_cents: refreshedTotals.platformFee,
                    total_cents: refreshedTotals.total,
                  },
                  lastSyncedAt: new Date().toISOString(),
                });
                return true;
              }
              logger.error(
                'Error adding cart item',
                'cartStore',
                { cartId: cart.id, item },
                insertError
              );
              throw insertError;
            }

            const updatedItems = [...cart.items, newItem as CartItemWithDetails];
            const { subtotal, platformFee, total } = calculateCartTotals(updatedItems);

            const { error: updateError } = await supabase
              .from('entry_carts')
              .update({
                subtotal_cents: subtotal,
                platform_fee_cents: platformFee,
                total_cents: total,
                // Sever the checkout-session link: an abandoned-but-open Stripe
                // page must not be able to pay for a cart that has since
                // changed. The webhook rejects sessions the cart no longer
                // points at (sessionCartGuard, Codex round-3 P1).
                stripe_checkout_session_id: null,
              })
              .eq('id', cart.id);

            // The item row is in the DB whatever the totals write did, so commit
            // it locally BEFORE deciding what a totals failure means. Throwing
            // first left the local list one row short of the DB, and the next
            // click on that chip then collided on the unique index (MYK9-530).
            // The stored totals are a cache; loadCart recomputes them from items.
            write({
              cart: {
                ...cart,
                items: updatedItems,
                subtotal_cents: subtotal,
                platform_fee_cents: platformFee,
                total_cents: total,
                stripe_checkout_session_id: null,
              },
              lastSyncedAt: new Date().toISOString(),
            });

            if (updateError) {
              logger.error(
                'Error updating cart totals',
                'cartStore',
                { cartId: cart.id },
                updateError
              );
              throw updateError;
            }

            return true;
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to add item';
            write({ error: message });
            logger.error('Failed to add cart item', 'cartStore', { item }, ensureError(error));
            return false;
          }
        },

        // Remove item from cart
        removeItem: async (itemId: string) => {
          const guard = captureCartWriteGuard();
          const write = guardedSet<CartState>(set, guard);
          const { cart } = get();
          if (!cart) {
            write({ error: 'No active cart' });
            return false;
          }

          try {
            const { error: deleteError } = await supabase
              .from('entry_cart_items')
              .delete()
              .eq('id', itemId);

            if (deleteError) {
              logger.error('Error removing cart item', 'cartStore', { itemId }, deleteError);
              throw deleteError;
            }

            const updatedItems = cart.items.filter(i => i.id !== itemId);
            const { subtotal, platformFee, total } = calculateCartTotals(updatedItems);

            const { error: updateError } = await supabase
              .from('entry_carts')
              .update({
                subtotal_cents: subtotal,
                platform_fee_cents: platformFee,
                total_cents: total,
                // Sever the checkout-session link: an abandoned-but-open Stripe
                // page must not be able to pay for a cart that has since
                // changed. The webhook rejects sessions the cart no longer
                // points at (sessionCartGuard, Codex round-3 P1).
                stripe_checkout_session_id: null,
              })
              .eq('id', cart.id);

            // The DELETE has already committed, so the row is gone from the DB
            // whatever the totals write did: commit the local removal BEFORE
            // deciding what a totals failure means, exactly as `addItem` now
            // does. Throwing first left the local list holding a row that no
            // longer exists, and the next click on that chip took the REMOVE
            // branch and deleted nothing (MYK9-530 review, P3-a). The stored
            // totals are a cache; loadCart recomputes them from items.
            write({
              cart: {
                ...cart,
                items: updatedItems,
                subtotal_cents: subtotal,
                platform_fee_cents: platformFee,
                total_cents: total,
                stripe_checkout_session_id: null,
              },
              lastSyncedAt: new Date().toISOString(),
            });

            if (updateError) {
              logger.error(
                'Error updating cart totals',
                'cartStore',
                { cartId: cart.id },
                updateError
              );
              throw updateError;
            }

            return true;
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to remove item';
            write({ error: message });
            logger.error('Failed to remove cart item', 'cartStore', { itemId }, ensureError(error));
            return false;
          }
        },

        // Update item in cart
        updateItem: async (itemId: string, updates: Partial<NewCartItem>) => {
          const guard = captureCartWriteGuard();
          const write = guardedSet<CartState>(set, guard);
          const { cart } = get();
          if (!cart) {
            write({ error: 'No active cart' });
            return false;
          }

          try {
            const updateData: Partial<EntryCartItem> = {};
            if (updates.handlerId !== undefined) updateData.handler_id = updates.handlerId || null;
            if (updates.jumpHeight !== undefined)
              updateData.jump_height = updates.jumpHeight || null;
            if (updates.specialRequests !== undefined)
              updateData.special_requests = updates.specialRequests || null;
            if (updates.entryFeeCents !== undefined)
              updateData.entry_fee_cents = updates.entryFeeCents;

            const { error: updateError } = await supabase
              .from('entry_cart_items')
              .update(updateData)
              .eq('id', itemId);

            if (updateError) {
              logger.error(
                'Error updating cart item',
                'cartStore',
                { itemId, updates },
                updateError
              );
              throw updateError;
            }

            const updatedItems = cart.items.map(i =>
              i.id === itemId ? { ...i, ...updateData } : i
            );

            // Sever the session on ANY item change (round-19 P2): handler,
            // jump height, and special requests are all stamped on the entry
            // via buildEntryInsert — an old Stripe page must not lock in
            // values the user changed after checkout started. Fee changes also
            // require a totals refresh.
            const totals =
              updates.entryFeeCents !== undefined ? calculateCartTotals(updatedItems) : null;

            const { error: cartUpdateError } = await supabase
              .from('entry_carts')
              .update({
                stripe_checkout_session_id: null,
                ...(totals !== null && {
                  subtotal_cents: totals.subtotal,
                  platform_fee_cents: totals.platformFee,
                  total_cents: totals.total,
                }),
              })
              .eq('id', cart.id);

            if (cartUpdateError) {
              logger.error(
                'Error updating cart',
                'cartStore',
                { cartId: cart.id },
                cartUpdateError
              );
              throw cartUpdateError;
            }

            write({
              cart: {
                ...cart,
                items: updatedItems,
                stripe_checkout_session_id: null,
                ...(totals !== null && {
                  subtotal_cents: totals.subtotal,
                  platform_fee_cents: totals.platformFee,
                  total_cents: totals.total,
                }),
              },
              lastSyncedAt: new Date().toISOString(),
            });

            return true;
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to update item';
            write({ error: message });
            logger.error(
              'Failed to update cart item',
              'cartStore',
              { itemId, updates },
              ensureError(error)
            );
            return false;
          }
        },

        // Clear all items from cart
        clearCart: async () => {
          const guard = captureCartWriteGuard();
          const write = guardedSet<CartState>(set, guard);
          const { cart } = get();
          if (!cart) {
            write({ error: 'No active cart' });
            return false;
          }

          try {
            const { error: deleteError } = await supabase
              .from('entry_cart_items')
              .delete()
              .eq('cart_id', cart.id);

            if (deleteError) {
              logger.error(
                'Error clearing cart items',
                'cartStore',
                { cartId: cart.id },
                deleteError
              );
              throw deleteError;
            }

            const { error: updateError } = await supabase
              .from('entry_carts')
              .update({
                subtotal_cents: 0,
                platform_fee_cents: 0,
                total_cents: 0,
                // Sever the checkout-session link (see addItem) — paying an
                // abandoned session after Clear Cart must not claim the empty
                // cart (Codex round-4 P1).
                stripe_checkout_session_id: null,
              })
              .eq('id', cart.id);

            if (updateError) {
              logger.warn(
                'Error updating cart totals',
                'cartStore',
                { cartId: cart.id },
                updateError
              );
            }

            write({
              cart: {
                ...cart,
                items: [],
                subtotal_cents: 0,
                platform_fee_cents: 0,
                total_cents: 0,
                stripe_checkout_session_id: null,
              },
              lastSyncedAt: new Date().toISOString(),
            });

            return true;
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to clear cart';
            write({ error: message });
            logger.error('Failed to clear cart', 'cartStore', {}, ensureError(error));
            return false;
          }
        },

        // Refresh cart data from database
        refreshCart: async () => {
          const { cart } = get();
          if (!cart) return;
          await get().loadCart(cart.show_id, cart.exhibitor_id);
        },

        // Extend cart expiration by another 30 minutes
        extendExpiration: async () => {
          const guard = captureCartWriteGuard();
          const write = guardedSet<CartState>(set, guard);
          const { cart } = get();
          if (!cart) {
            write({ error: 'No active cart' });
            return false;
          }

          try {
            const newExpiresAt = new Date(
              Date.now() + CART_EXPIRATION_MINUTES * 60 * 1000
            ).toISOString();

            const { error: updateError } = await supabase
              .from('entry_carts')
              .update({ expires_at: newExpiresAt })
              .eq('id', cart.id);

            if (updateError) {
              logger.error(
                'Error extending cart expiration',
                'cartStore',
                { cartId: cart.id },
                updateError
              );
              throw updateError;
            }

            write({
              cart: { ...cart, expires_at: newExpiresAt },
              expirationWarning: false,
              lastSyncedAt: new Date().toISOString(),
            });

            return true;
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to extend expiration';
            write({ error: message });
            logger.error('Failed to extend cart expiration', 'cartStore', {}, ensureError(error));
            return false;
          }
        },

        // Abandon cart (mark as abandoned)
        abandonCart: async () => {
          const guard = captureCartWriteGuard();
          const write = guardedSet<CartState>(set, guard);
          const { cart } = get();
          if (!cart) return true;

          try {
            const { error: updateError } = await supabase
              .from('entry_carts')
              .update({ status: 'abandoned' })
              .eq('id', cart.id);

            if (updateError) {
              logger.error('Error abandoning cart', 'cartStore', { cartId: cart.id }, updateError);
              throw updateError;
            }

            write({
              cart: null,
              expirationWarning: false,
              lastSyncedAt: new Date().toISOString(),
            });

            return true;
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to abandon cart';
            write({ error: message });
            logger.error('Failed to abandon cart', 'cartStore', {}, ensureError(error));
            return false;
          }
        },

        // Computed getters
        getTotalEntryFees: () => get().cart?.subtotal_cents || 0,
        getPlatformFee: () => get().cart?.platform_fee_cents || 0,
        getTotalAmount: () => get().cart?.total_cents || 0,
        getItemCount: () => get().cart?.items.length || 0,

        getTimeUntilExpiration: () => {
          const expiresAt = get().cart?.expires_at;
          if (!expiresAt) return null;
          return Math.max(0, new Date(expiresAt).getTime() - Date.now());
        },

        isExpired: () => {
          const timeRemaining = get().getTimeUntilExpiration();
          return timeRemaining !== null && timeRemaining <= 0;
        },

        // Checkout routing overflow cart items to waitlist RPC
        checkoutWithWaitlist: async (
          exhibitorId: string,
          waitlistCartItemIds: Set<string>
        ): Promise<CheckoutResult | null> => {
          const guard = captureCartWriteGuard();
          const write = guardedSet<CartState>(set, guard);
          const { cart } = get();
          if (!cart) {
            write({ error: 'No active cart' });
            return null;
          }

          const confirmed: string[] = [];
          const waitlisted: WaitlistEntryResult[] = [];

          try {
            for (const item of cart.items) {
              if (!item.class_id || !item.dog_id) continue;

              if (waitlistCartItemIds.has(item.id)) {
                // Add to waitlist instead of creating a normal entry
                const rpcArgs: {
                  p_class_id: string;
                  p_exhibitor_id: string;
                  p_dog_id: string;
                  p_handler_id?: string;
                } = {
                  p_class_id: item.class_id,
                  p_exhibitor_id: exhibitorId,
                  p_dog_id: item.dog_id,
                };
                if (item.handler_id) rpcArgs.p_handler_id = item.handler_id;
                const { data, error: rpcError } = await supabase.rpc('add_to_waitlist', rpcArgs);

                if (rpcError) {
                  logger.error(
                    'Error adding to waitlist',
                    'cartStore',
                    { classId: item.class_id, dogId: item.dog_id },
                    rpcError
                  );
                  throw rpcError;
                }

                const result = data as WaitlistEntryResult;
                waitlisted.push({
                  ...result,
                  className: item.class?.name,
                });
              } else {
                // Normal entry — caller handles Stripe session or direct insert
                confirmed.push(item.class_id);
              }
            }

            return { confirmed, waitlisted };
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Checkout failed';
            write({ error: message });
            logger.error('checkoutWithWaitlist failed', 'cartStore', {}, ensureError(error));
            return null;
          }
        },

        setError: (error: string | null) => set({ error }),

        dismissDroppedClosedClassItems: () => set({ droppedClosedClassItems: [] }),

        reset: () => {
          // Drop every write still in flight (MYK9-651) and forget in-flight
          // openers, so a user signing back in starts fresh rather than joining
          // an opener whose writes are now dropped.
          invalidateCartWrites();
          resetEnsureCartInFlight();
          recoveryCartInFlight.clear();
          // `partialize` derives the persisted recovery ids from `cart`, so
          // clearing `cart` rewrites the persisted slice with none of them.
          set({
            cart: null,
            cartRecoveryInfo: null,
            isLoading: false,
            loadInitiated: false,
            error: null,
            lastSyncedAt: null,
            expirationWarning: false,
            droppedClosedClassItems: [],
          });
        },
      }),
      {
        name: 'myk9-cart-storage',
        partialize: state => ({
          lastSyncedAt: state.lastSyncedAt,
          droppedClosedClassItems: state.droppedClosedClassItems,
          cartRecoveryInfo: state.cart
            ? {
                id: state.cart.id,
                showId: state.cart.show_id,
                exhibitorId: state.cart.exhibitor_id,
              }
            : null,
        }),
      }
    ),
    { name: 'CartStore', enabled: import.meta.env.DEV }
  )
);

// The persisted cart must not outlive the account that built it (MYK9-651).
onAccountBoundary(() => useCartStore.getState().reset());

// Stable empty references to prevent infinite re-render loops in Zustand selectors
const EMPTY_ITEMS: CartItemWithDetails[] = [];

// Selector hooks for common patterns
export const useCartItems = () => useCartStore(state => state.cart?.items ?? EMPTY_ITEMS);
export const useCartItemCount = () => useCartStore(state => state.getItemCount());
export const useCartTotal = () => useCartStore(state => state.getTotalAmount());
export const useCartExpiration = () => {
  const expiresAt = useCartStore(state => state.cart?.expires_at ?? null);
  const timeRemaining = useCartStore(state => state.getTimeUntilExpiration());
  const isExpired = useCartStore(state => state.isExpired());
  const isWarning = useCartStore(state => state.expirationWarning);
  return { expiresAt, timeRemaining, isExpired, isWarning };
};
