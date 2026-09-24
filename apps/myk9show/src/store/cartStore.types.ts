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

/**
 * The wizard cart opener's outcome (MYK9-581). There is no third case on
 * purpose: a caller cannot reach a state where it has neither a cart to render
 * nor a message to show. Lives here rather than beside `ensureCartOnce` so the
 * opener module and `CartState` do not have to import each other.
 */
export type EnsureCartResult =
  { kind: 'ready'; cart: CartWithDetails } | { kind: 'failed'; error: string };

// Cart status enum
export type CartStatus = 'active' | 'submitted' | 'abandoned' | 'expired';

// Extended cart item with related data
export interface CartItemWithDetails extends Omit<EntryCartItem, 'entry_id'> {
  /** Set only when Finish Payment is recovering an existing unpaid entry. */
  entry_id?: string | null;
  dog?:
    | {
        id: string;
        name: string;
        call_name: string | null;
        // MYK9-90: breed belongs to a registration, not to the dog. The cart is
        // a generic surface, so the PRIMARY registration answers — resolve it
        // with `getDogBreedLabel` rather than reading a `breed` off the dog.
        registrations?:
          | Array<{
              id?: string | null;
              created_at?: string | null;
              breed?: string | null;
            }>
          | null
          | undefined;
      }
    | undefined;
  class?:
    | {
        id: string;
        name: string;
        level: string | null;
        trial_id: string;
        allow_waitlist: boolean | null;
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

// Waitlist entry returned from the add_to_waitlist RPC
export interface WaitlistEntryResult {
  id: string;
  class_id: string;
  dog_id: string;
  exhibitor_id: string;
  handler_id: string | null;
  position: number;
  status: string;
  /** Class name for display (joined via cart item details) */
  className?: string | undefined;
}

// Result of a checkout that may include waitlisted entries
export interface CheckoutResult {
  /** Entry IDs that were confirmed normally */
  confirmed: string[];
  /** Waitlist entries for full classes */
  waitlisted: WaitlistEntryResult[];
}

/**
 * A cart line removed on load because its class can no longer be entered
 * (MYK9-656). Kept so the exhibitor is told what left their cart and why.
 */
export interface DroppedCartItem {
  itemId: string;
  dogName: string | null;
  className: string | null;
  /** `getClassEntryWindow`'s sentence, e.g. "This class was cancelled". */
  reason: string;
}

// Cart state interface
export interface CartState {
  // Data
  cart: CartWithDetails | null;
  isLoading: boolean;
  // True once a cart load has been initiated this session. Lets the cart UI keep
  // a hydration placeholder up before the first load resolves, instead of
  // flashing the empty-cart state on the pre-load frame of a direct visit.
  loadInitiated: boolean;
  error: string | null;
  lastSyncedAt: string | null;
  /**
   * The only part of the cart that survives a full document load: zustand's
   * `partialize` persists these ids (never the items). A Stripe return is a
   * full load, so this is what the checkout-result pages have to work with
   * before `loadActiveCart` rehydrates — it was already written and rehydrated,
   * just never declared here.
   */
  cartRecoveryInfo?: { id: string; showId: string; exhibitorId: string } | null;
  /**
   * The auth user id the persisted slice belongs to, stamped by the account
   * announcement and persisted with it (MYK9-651). `undefined` means no
   * announcement has ever reached this storage; `reset()` leaves it alone, since
   * it records who is signed in, not what the cart holds.
   */
  ownerAuthUserId?: string | null | undefined;

  // Expiration tracking
  expirationWarning: boolean;

  /**
   * Lines removed from a loaded cart because their class closed (MYK9-656).
   * Accumulates across loads until the exhibitor dismisses it, so moving from
   * the wizard to /cart does not silently lose the explanation.
   */
  droppedClosedClassItems: DroppedCartItem[];
  dismissDroppedClosedClassItems: () => void;

  // Actions
  loadCart: (showId: string, exhibitorId: string) => Promise<CartWithDetails | null>;
  /** Hydrate the most recent active cart regardless of show — for direct
   * visits to /cart (refresh, new tab). The store is in-memory only. */
  loadActiveCart: (
    exhibitorId: string,
    options?: {
      showId?: string;
      recoveryEntryIds?: string[];
      /** The calling opener's token; its writes are dropped once false (MYK9-655). */
      isCurrent?: () => boolean;
    }
  ) => Promise<CartWithDetails | null>;
  /**
   * Recover-or-create this exhibitor's cart for a show as ONE coalesced unit.
   * The registration wizard's opener; never inserts while an active row exists,
   * and never resolves without either a cart or a message (MYK9-581).
   */
  ensureCart: (showId: string, exhibitorId: string) => Promise<EnsureCartResult>;
  createCart: (
    showId: string,
    exhibitorId: string,
    options?: { isCurrent?: () => boolean }
  ) => Promise<CartWithDetails | null>;
  addItem: (item: NewCartItem) => Promise<boolean>;
  removeItem: (itemId: string) => Promise<boolean>;
  updateItem: (itemId: string, updates: Partial<NewCartItem>) => Promise<boolean>;
  clearCart: () => Promise<boolean>;
  refreshCart: () => Promise<void>;
  extendExpiration: () => Promise<boolean>;
  abandonCart: () => Promise<boolean>;
  /**
   * Checkout that routes overflow cart items to the waitlist RPC instead of
   * creating normal entries. Returns a split result so the caller can show
   * "N confirmed, M added to wait list".
   */
  checkoutWithWaitlist: (
    exhibitorId: string,
    waitlistCartItemIds: Set<string>
  ) => Promise<CheckoutResult | null>;

  // Computed getters
  getTotalEntryFees: () => number;
  getPlatformFee: () => number;
  getTotalAmount: () => number;
  getItemCount: () => number;
  getTimeUntilExpiration: () => number | null;
  isExpired: () => boolean;

  // State management
  setError: (error: string | null) => void;
  /**
   * Empty the store AND its persisted recovery ids, and drop every cart write
   * still in flight. Called when the signed-in user changes (MYK9-651).
   */
  reset: () => void;
}
