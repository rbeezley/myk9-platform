/**
 * Cart Store Types
 *
 * Type definitions for the cart store, extracted from cartStore.ts.
 */

import type { Database } from '@myk9/supabase';

// Types from database
export type EntryCart = Database['public']['Tables']['entry_carts']['Row'];
export type EntryCartInsert = Database['public']['Tables']['entry_carts']['Insert'];
export type EntryCartItem = Database['public']['Tables']['entry_cart_items']['Row'];
export type EntryCartItemInsert = Database['public']['Tables']['entry_cart_items']['Insert'];

// Cart status enum
export type CartStatus = 'active' | 'submitted' | 'abandoned' | 'expired';

// Extended cart item with related data
export interface CartItemWithDetails extends EntryCartItem {
  dog?:
    | {
        id: string;
        name: string;
        call_name: string | null;
        breed: string;
      }
    | undefined;
  class?:
    | {
        id: string;
        name: string;
        level: string | null;
        trial_id: string;
      }
    | undefined;
  handler?:
    | {
        id: string;
        first_name: string;
        last_name: string;
      }
    | undefined;
}

// Extended cart with related data
export interface CartWithDetails extends EntryCart {
  items: CartItemWithDetails[];
  show?:
    | {
        id: string;
        name: string;
        start_date: string;
        entry_close_date: string;
      }
    | undefined;
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
export interface CartState {
  // Data
  cart: CartWithDetails | null;
  isLoading: boolean;
  error: string | null;
  lastSyncedAt: string | null;

  // Expiration tracking
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
