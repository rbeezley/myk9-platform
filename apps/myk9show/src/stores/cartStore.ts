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
import type { Database } from '@myk9/supabase';

// Types from database
type EntryCart = Database['public']['Tables']['entry_carts']['Row'];
type EntryCartInsert = Database['public']['Tables']['entry_carts']['Insert'];
type EntryCartItem = Database['public']['Tables']['entry_cart_items']['Row'];
type EntryCartItemInsert = Database['public']['Tables']['entry_cart_items']['Insert'];

// Cart status enum
export type CartStatus = 'active' | 'submitted' | 'abandoned' | 'expired';

// Extended cart item with related data
export interface CartItemWithDetails extends EntryCartItem {
  dog?: {
    id: string;
    name: string;
    call_name: string | null;
    breed: string;
  } | undefined;
  class?: {
    id: string;
    name: string;
    level: string | null;
    trial_id: string;
  } | undefined;
  handler?: {
    id: string;
    first_name: string;
    last_name: string;
  } | undefined;
}

// Extended cart with related data
export interface CartWithDetails extends EntryCart {
  items: CartItemWithDetails[];
  show?: {
    id: string;
    name: string;
    start_date: string;
    entry_close_date: string;
  } | undefined;
}

// New item input type
export interface NewCartItem {
  dogId: string;
  classId: string;
  handlerId?: string | undefined;
  jumpHeight?: string | undefined;
  specialRequests?: string | undefined;
  entryFeeCents: number;
}

// Cart state interface
interface CartState {
  // Data
  cart: CartWithDetails | null;
  isLoading: boolean;
  error: string | null;
  lastSyncedAt: string | null;

  // Expiration tracking
  expiresAt: string | null;
  expirationWarning: boolean;

  // Actions
  loadCart: (showId: string, exhibitorId: string) => Promise<CartWithDetails | null>;
  createCart: (showId: string, exhibitorId: string) => Promise<CartWithDetails | null>;
  addItem: (item: NewCartItem) => Promise<boolean>;
  removeItem: (itemId: string) => Promise<boolean>;
  updateItem: (itemId: string, updates: Partial<NewCartItem>) => Promise<boolean>;
  clearCart: () => Promise<boolean>;
  refreshCart: () => Promise<void>;
  extendExpiration: () => Promise<boolean>;
  abandonCart: () => Promise<boolean>;

  // Computed getters
  getTotalEntryFees: () => number;
  getPlatformFee: () => number;
  getTotalAmount: () => number;
  getItemCount: () => number;
  getTimeUntilExpiration: () => number | null;
  isExpired: () => boolean;

  // State management
  setError: (error: string | null) => void;
  reset: () => void;
}

// Platform fee rate (3%)
const PLATFORM_FEE_RATE = 0.03;

// Cart expiration time (30 minutes)
const CART_EXPIRATION_MINUTES = 30;

// Warning threshold (5 minutes before expiration)
const EXPIRATION_WARNING_MINUTES = 5;

export const useCartStore = create<CartState>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial state
        cart: null,
        isLoading: false,
        error: null,
        lastSyncedAt: null,
        expiresAt: null,
        expirationWarning: false,

        // Load existing cart for a show
        loadCart: async (showId: string, exhibitorId: string) => {
          set({ isLoading: true, error: null });

          try {
            // Look for an active cart for this show
            const { data: cartData, error: cartError } = await supabase
              .from('entry_carts')
              .select(`
                *,
                show:shows(id, name, start_date, entry_close_date)
              `)
              .eq('show_id', showId)
              .eq('exhibitor_id', exhibitorId)
              .eq('status', 'active')
              .gt('expires_at', new Date().toISOString())
              .maybeSingle();

            if (cartError) {
              logger.error('Error loading cart', 'cartStore', { showId, exhibitorId }, cartError);
              throw cartError;
            }

            if (!cartData) {
              set({ cart: null, isLoading: false, expiresAt: null });
              return null;
            }

            // Load cart items with related data
            const { data: itemsData, error: itemsError } = await supabase
              .from('entry_cart_items')
              .select(`
                *,
                dog:dogs(id, name, call_name, breed),
                class:classes(id, name, level, trial_id),
                handler:people(id, first_name, last_name)
              `)
              .eq('cart_id', cartData.id);

            if (itemsError) {
              logger.error('Error loading cart items', 'cartStore', { cartId: cartData.id }, itemsError);
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
              expiresAt: cartData.expires_at,
              lastSyncedAt: new Date().toISOString(),
              expirationWarning: get().getTimeUntilExpiration() !== null &&
                (get().getTimeUntilExpiration() || 0) < EXPIRATION_WARNING_MINUTES * 60 * 1000,
            });

            return cartWithDetails;
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to load cart';
            set({ error: message, isLoading: false });
            logger.error('Failed to load cart', 'cartStore', { showId, exhibitorId }, error as Error);
            return null;
          }
        },

        // Create a new cart
        createCart: async (showId: string, exhibitorId: string) => {
          set({ isLoading: true, error: null });

          try {
            const expiresAt = new Date(Date.now() + CART_EXPIRATION_MINUTES * 60 * 1000).toISOString();

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
              .select(`
                *,
                show:shows(id, name, start_date, entry_close_date)
              `)
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
              expiresAt: cartData.expires_at,
              lastSyncedAt: new Date().toISOString(),
              expirationWarning: false,
            });

            return cartWithDetails;
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to create cart';
            set({ error: message, isLoading: false });
            logger.error('Failed to create cart', 'cartStore', { showId, exhibitorId }, error as Error);
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
              .select(`
                *,
                dog:dogs(id, name, call_name, breed),
                class:classes(id, name, level, trial_id),
                handler:people(id, first_name, last_name)
              `)
              .single();

            if (insertError) {
              logger.error('Error adding cart item', 'cartStore', { cartId: cart.id, item }, insertError);
              throw insertError;
            }

            // Update totals
            const updatedItems = [...cart.items, newItem as CartItemWithDetails];
            const subtotal = updatedItems.reduce((sum, i) => sum + i.entry_fee_cents, 0);
            const platformFee = Math.round(subtotal * PLATFORM_FEE_RATE);
            const total = subtotal + platformFee;

            const { error: updateError } = await supabase
              .from('entry_carts')
              .update({
                subtotal_cents: subtotal,
                platform_fee_cents: platformFee,
                total_cents: total,
              })
              .eq('id', cart.id);

            if (updateError) {
              logger.warn('Error updating cart totals', 'cartStore', { cartId: cart.id }, updateError);
            }

            set({
              cart: {
                ...cart,
                items: updatedItems,
                subtotal_cents: subtotal,
                platform_fee_cents: platformFee,
                total_cents: total,
              },
              lastSyncedAt: new Date().toISOString(),
            });

            return true;
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to add item';
            set({ error: message });
            logger.error('Failed to add cart item', 'cartStore', { item }, error as Error);
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

            // Update totals
            const updatedItems = cart.items.filter(i => i.id !== itemId);
            const subtotal = updatedItems.reduce((sum, i) => sum + i.entry_fee_cents, 0);
            const platformFee = Math.round(subtotal * PLATFORM_FEE_RATE);
            const total = subtotal + platformFee;

            const { error: updateError } = await supabase
              .from('entry_carts')
              .update({
                subtotal_cents: subtotal,
                platform_fee_cents: platformFee,
                total_cents: total,
              })
              .eq('id', cart.id);

            if (updateError) {
              logger.warn('Error updating cart totals', 'cartStore', { cartId: cart.id }, updateError);
            }

            set({
              cart: {
                ...cart,
                items: updatedItems,
                subtotal_cents: subtotal,
                platform_fee_cents: platformFee,
                total_cents: total,
              },
              lastSyncedAt: new Date().toISOString(),
            });

            return true;
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to remove item';
            set({ error: message });
            logger.error('Failed to remove cart item', 'cartStore', { itemId }, error as Error);
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
            if (updates.jumpHeight !== undefined) updateData.jump_height = updates.jumpHeight || null;
            if (updates.specialRequests !== undefined) updateData.special_requests = updates.specialRequests || null;
            if (updates.entryFeeCents !== undefined) updateData.entry_fee_cents = updates.entryFeeCents;

            const { error: updateError } = await supabase
              .from('entry_cart_items')
              .update(updateData)
              .eq('id', itemId);

            if (updateError) {
              logger.error('Error updating cart item', 'cartStore', { itemId, updates }, updateError);
              throw updateError;
            }

            // Update local state
            const updatedItems = cart.items.map(i =>
              i.id === itemId ? { ...i, ...updateData } : i
            );

            // Recalculate totals if fee changed
            if (updates.entryFeeCents !== undefined) {
              const subtotal = updatedItems.reduce((sum, i) => sum + i.entry_fee_cents, 0);
              const platformFee = Math.round(subtotal * PLATFORM_FEE_RATE);
              const total = subtotal + platformFee;

              await supabase
                .from('entry_carts')
                .update({
                  subtotal_cents: subtotal,
                  platform_fee_cents: platformFee,
                  total_cents: total,
                })
                .eq('id', cart.id);

              set({
                cart: {
                  ...cart,
                  items: updatedItems,
                  subtotal_cents: subtotal,
                  platform_fee_cents: platformFee,
                  total_cents: total,
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
            logger.error('Failed to update cart item', 'cartStore', { itemId, updates }, error as Error);
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
              logger.error('Error clearing cart items', 'cartStore', { cartId: cart.id }, deleteError);
              throw deleteError;
            }

            const { error: updateError } = await supabase
              .from('entry_carts')
              .update({
                subtotal_cents: 0,
                platform_fee_cents: 0,
                total_cents: 0,
              })
              .eq('id', cart.id);

            if (updateError) {
              logger.warn('Error updating cart totals', 'cartStore', { cartId: cart.id }, updateError);
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
            logger.error('Failed to clear cart', 'cartStore', {}, error as Error);
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
            const newExpiresAt = new Date(Date.now() + CART_EXPIRATION_MINUTES * 60 * 1000).toISOString();

            const { error: updateError } = await supabase
              .from('entry_carts')
              .update({ expires_at: newExpiresAt })
              .eq('id', cart.id);

            if (updateError) {
              logger.error('Error extending cart expiration', 'cartStore', { cartId: cart.id }, updateError);
              throw updateError;
            }

            set({
              cart: { ...cart, expires_at: newExpiresAt },
              expiresAt: newExpiresAt,
              expirationWarning: false,
              lastSyncedAt: new Date().toISOString(),
            });

            return true;
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to extend expiration';
            set({ error: message });
            logger.error('Failed to extend cart expiration', 'cartStore', {}, error as Error);
            return false;
          }
        },

        // Abandon cart (mark as abandoned)
        abandonCart: async () => {
          const { cart } = get();
          if (!cart) {
            return true; // No cart to abandon
          }

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
              expiresAt: null,
              expirationWarning: false,
              lastSyncedAt: new Date().toISOString(),
            });

            return true;
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to abandon cart';
            set({ error: message });
            logger.error('Failed to abandon cart', 'cartStore', {}, error as Error);
            return false;
          }
        },

        // Computed: Total entry fees
        getTotalEntryFees: () => {
          const { cart } = get();
          return cart?.subtotal_cents || 0;
        },

        // Computed: Platform fee
        getPlatformFee: () => {
          const { cart } = get();
          return cart?.platform_fee_cents || 0;
        },

        // Computed: Total amount
        getTotalAmount: () => {
          const { cart } = get();
          return cart?.total_cents || 0;
        },

        // Computed: Item count
        getItemCount: () => {
          const { cart } = get();
          return cart?.items.length || 0;
        },

        // Computed: Time until expiration in milliseconds
        getTimeUntilExpiration: () => {
          const { expiresAt } = get();
          if (!expiresAt) return null;

          const expirationTime = new Date(expiresAt).getTime();
          const now = Date.now();
          return Math.max(0, expirationTime - now);
        },

        // Computed: Check if cart is expired
        isExpired: () => {
          const timeRemaining = get().getTimeUntilExpiration();
          return timeRemaining !== null && timeRemaining <= 0;
        },

        // Set error state
        setError: (error: string | null) => {
          set({ error });
        },

        // Reset store state
        reset: () => {
          set({
            cart: null,
            isLoading: false,
            error: null,
            lastSyncedAt: null,
            expiresAt: null,
            expirationWarning: false,
          });
        },
      }),
      {
        name: 'myk9-cart-storage',
        // Only persist cart ID for recovery, not full cart data
        partialize: (state) => ({
          lastSyncedAt: state.lastSyncedAt,
          // Store minimal cart info for recovery
          cartRecoveryInfo: state.cart ? {
            id: state.cart.id,
            showId: state.cart.show_id,
            exhibitorId: state.cart.exhibitor_id,
          } : null,
        }),
      }
    ),
    { name: 'CartStore', enabled: import.meta.env.DEV }
  )
);

// Selector hooks for common patterns
export const useCartItems = () => useCartStore((state) => state.cart?.items || []);
export const useCartItemCount = () => useCartStore((state) => state.getItemCount());
export const useCartTotal = () => useCartStore((state) => state.getTotalAmount());
export const useCartExpiration = () => useCartStore((state) => ({
  expiresAt: state.expiresAt,
  timeRemaining: state.getTimeUntilExpiration(),
  isExpired: state.isExpired(),
  isWarning: state.expirationWarning,
}));
