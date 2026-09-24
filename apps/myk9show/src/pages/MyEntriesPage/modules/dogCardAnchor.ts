/**
 * The focus anchor for one rendered My Shows dog card (MYK9-658).
 *
 * Keyed on `MyShowDog.id` — the first merged class row's `entries.id` — which
 * is unique per rendered CARD, never on `dogId`: dogs merge by `dogId` inside a
 * show group and the page renders every group at once, so one dog entered in
 * two shows would produce two elements with one id, and `getElementById` would
 * send focus into the wrong show.
 *
 * @module MyEntriesPage/modules/dogCardAnchor
 */

/** DOM id of the dog card's focus anchor (its name). */
export function dogCardAnchorId(dogCardId: string): string {
  return `my-show-dog-card-${dogCardId}`;
}
