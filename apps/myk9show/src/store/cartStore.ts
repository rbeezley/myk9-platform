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

// Re-export types so existing imports continue to work
export type {
  CartStatus,
  CartItemWithDetails,
  CartWithDetails,
  NewCartItem,
  WaitlistEntryResult,
  CheckoutResult,
} from './cartStore.types';

export const useCartStore = create<CartState>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial state
        cart: null,
        isLoading: false,
        error: null,
        lastSyncedAt: null,
        expirationWarning: false,

        // Load existing cart for a show
        loadCart: async (showId: string, exhibitorId: string) => {
          set({ isLoading: true, error: null });

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
              set({ cart: null, isLoading: false });
              return null;
            }

            const { data: itemsData, error: itemsError } = await supabase
              .from('entry_cart_items')
              .select(
                `*, dog:dogs(id, name, call_name, breed), class:classes(id, name, level, trial_id), handler:people(id, first_name, last_name)`
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

            const cartWithDetails: CartWithDetails = {
              ...cartData,
              items: (itemsData || []) as CartItemWithDetails[],
              show: cartData.show as CartWithDetails['show'],
            };

            set({
              cart: cartWithDetails,
              isLoading: false,
              lastSyncedAt: new Date().toISOString(),
            });

            const timeUntilExpiry = get().getTimeUntilExpiration();
            if (
              timeUntilExpiry !== null &&
              timeUntilExpiry < EXPIRATION_WARNING_MINUTES * 60 * 1000
            ) {
              set({ expirationWarning: true });
            }

            return cartWithDetails;
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to load cart';
            set({ error: message, isLoading: false });
            logger.error(
              'Failed to load cart',
              'cartStore',
              { showId, exhibitorId },
              ensureError(error)
            );
            return null;
          }
        },

        // Load the most recent active cart regardless of show — lets /cart be
        // visited directly (deep link, refresh, new tab). Without this the
        // page renders only whatever happens to be in tab memory
        // (2026-06-10 walkthrough finding).
        loadActiveCart: async (exhibitorId: string) => {
          const { data, error } = await supabase
            .from('entry_carts')
            .select('show_id')
            .eq('exhibitor_id', exhibitorId)
            .eq('status', 'active')
            .gt('expires_at', new Date().toISOString())
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (error) {
            logger.error('Error finding active cart', 'cartStore', { exhibitorId }, error);
            set({ cart: null, isLoading: false });
            return null;
          }
          if (!data) {
            set({ cart: null, isLoading: false });
            return null;
          }
          return get().loadCart(data.show_id, exhibitorId);
        },

        // Create a new cart
        createCart: async (showId: string, exhibitorId: string) => {
          set({ isLoading: true, error: null });

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
              logger.error('Error creating cart', 'cartStore', { showId, exhibitorId }, cartError);
              throw cartError;
            }

            const cartWithDetails: CartWithDetails = {
              ...cartData,
              items: [],
              show: cartData.show as CartWithDetails['show'],
            };

            set({
              cart: cartWithDetails,
              isLoading: false,
              lastSyncedAt: new Date().toISOString(),
              expirationWarning: false,
            });

            return cartWithDetails;
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to create cart';
            set({ error: message, isLoading: false });
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
          const { cart } = get();
          if (!cart) {
            set({ error: 'No active cart' });
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
                `*, dog:dogs(id, name, call_name, breed), class:classes(id, name, level, trial_id), handler:people(id, first_name, last_name)`
              )
              .single();

            if (insertError) {
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

            if (updateError) {
              logger.error(
                'Error updating cart totals',
                'cartStore',
                { cartId: cart.id },
                updateError
              );
              throw updateError;
            }

            set({
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

            return true;
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to add item';
            set({ error: message });
            logger.error('Failed to add cart item', 'cartStore', { item }, ensureError(error));
            return false;
          }
        },

        // Remove item from cart
        removeItem: async (itemId: string) => {
          const { cart } = get();
          if (!cart) {
            set({ error: 'No active cart' });
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

            if (updateError) {
              logger.error(
                'Error updating cart totals',
                'cartStore',
                { cartId: cart.id },
                updateError
              );
              throw updateError;
            }

            set({
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

            return true;
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to remove item';
            set({ error: message });
            logger.error('Failed to remove cart item', 'cartStore', { itemId }, ensureError(error));
            return false;
          }
        },

        // Update item in cart
        updateItem: async (itemId: string, updates: Partial<NewCartItem>) => {
          const { cart } = get();
          if (!cart) {
            set({ error: 'No active cart' });
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

            if (updates.entryFeeCents !== undefined) {
              const { subtotal, platformFee, total } = calculateCartTotals(updatedItems);

              await supabase
                .from('entry_carts')
                .update({
                  subtotal_cents: subtotal,
                  platform_fee_cents: platformFee,
                  total_cents: total,
                  // Sever the checkout-session link (see addItem).
                  stripe_checkout_session_id: null,
                })
                .eq('id', cart.id);

              set({
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
            } else {
              set({
                cart: { ...cart, items: updatedItems },
                lastSyncedAt: new Date().toISOString(),
              });
            }

            return true;
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to update item';
            set({ error: message });
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
          const { cart } = get();
          if (!cart) {
            set({ error: 'No active cart' });
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
              .update({ subtotal_cents: 0, platform_fee_cents: 0, total_cents: 0 })
              .eq('id', cart.id);

            if (updateError) {
              logger.warn(
                'Error updating cart totals',
                'cartStore',
                { cartId: cart.id },
                updateError
              );
            }

            set({
              cart: {
                ...cart,
                items: [],
                subtotal_cents: 0,
                platform_fee_cents: 0,
                total_cents: 0,
              },
              lastSyncedAt: new Date().toISOString(),
            });

            return true;
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to clear cart';
            set({ error: message });
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
          const { cart } = get();
          if (!cart) {
            set({ error: 'No active cart' });
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

            set({
              cart: { ...cart, expires_at: newExpiresAt },
              expirationWarning: false,
              lastSyncedAt: new Date().toISOString(),
            });

            return true;
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to extend expiration';
            set({ error: message });
            logger.error('Failed to extend cart expiration', 'cartStore', {}, ensureError(error));
            return false;
          }
        },

        // Abandon cart (mark as abandoned)
        abandonCart: async () => {
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

            set({
              cart: null,
              expirationWarning: false,
              lastSyncedAt: new Date().toISOString(),
            });

            return true;
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to abandon cart';
            set({ error: message });
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

        // Checkout routing full-class items to waitlist RPC
        checkoutWithWaitlist: async (
          exhibitorId: string,
          fullClassIds: Set<string>
        ): Promise<CheckoutResult | null> => {
          const { cart } = get();
          if (!cart) {
            set({ error: 'No active cart' });
            return null;
          }

          const confirmed: string[] = [];
          const waitlisted: WaitlistEntryResult[] = [];

          try {
            for (const item of cart.items) {
              if (!item.class_id || !item.dog_id) continue;

              if (fullClassIds.has(item.class_id)) {
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
            set({ error: message });
            logger.error('checkoutWithWaitlist failed', 'cartStore', {}, ensureError(error));
            return null;
          }
        },

        setError: (error: string | null) => set({ error }),

        reset: () => {
          set({
            cart: null,
            isLoading: false,
            error: null,
            lastSyncedAt: null,
            expirationWarning: false,
          });
        },
      }),
      {
        name: 'myk9-cart-storage',
        partialize: state => ({
          lastSyncedAt: state.lastSyncedAt,
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
