/**
 * The one place that knows how a saved registration draft is addressed.
 *
 * Two surfaces read this storage: the wizard itself (`useDraftPersistence`) and
 * the checkout-success page, which prunes the lines it just filed without ever
 * mounting the wizard. Both must agree byte-for-byte on the key, so neither
 * spells it inline.
 *
 * `userId` is baked into the key so the per-show draft cap and "clear all"
 * operate per user, not across everyone who has used this device.
 */

export const DRAFT_STORAGE_KEY_PREFIX = 'registration-draft';

export function draftKey(prefix: string, showId: string, userId: string, draftId: string): string {
  return `${prefix}-${showId}-${userId}-${draftId}`;
}

export function draftMetadataKey(prefix: string, showId: string, userId: string): string {
  return `${prefix}-metadata-${showId}-${userId}`;
}
