/**
 * Who, besides the viewer, can still keep an own result private (MYK9-2311).
 *
 * The server counts a person toward "everyone on the entry" only by id: the dog's
 * owner, the dog's co-owner and the entry's `handler_id`. A handler typed in as free
 * text has no `handler_id`, so the server never asks them and they never block. This
 * decides from those same ids, never from a name on the row.
 */
export interface EntryPeopleIds {
  /** The viewer's own `people.id`; unknown while the profile has not loaded. */
  viewerPersonId: string | null | undefined;
  /** `dogs.owner_id`. `undefined` means the row did not carry the dog's people at all. */
  ownerId: string | null | undefined;
  /** `dogs.co_owner_id`; null is "no co-owner", `undefined` is "not on the row". */
  coOwnerId: string | null | undefined;
  /** `entries.handler_id`; null is a typed-in handler or none, `undefined` is "not on the row". */
  handlerId: string | null | undefined;
  /** The handler's display name on the row, used only to name a linked handler. */
  handlerName: string | null | undefined;
}

export type OtherPeopleOnEntry =
  /** Nobody else is on the entry by id: the viewer's yes already makes it public. */
  | { kind: 'none' }
  /** A linked handler other than the viewer is on the entry, and the row names them. */
  | { kind: 'named'; name: string }
  /** Someone else is on the entry by id, but there is no name to give. */
  | { kind: 'unnamed' }
  /** The row cannot say who else is on the entry. */
  | { kind: 'unknown' };

export function otherPeopleOnEntry(people: EntryPeopleIds): OtherPeopleOnEntry {
  const { viewerPersonId, ownerId, coOwnerId, handlerId, handlerName } = people;
  // A field the row did not carry (undefined) is unknown, never "no one": null is the only
  // answer that means nobody is linked. A missing viewer id cannot be told apart from "someone else".
  if (
    !viewerPersonId ||
    ownerId === undefined ||
    coOwnerId === undefined ||
    handlerId === undefined
  ) {
    return { kind: 'unknown' };
  }
  const others = new Set(
    [ownerId, coOwnerId, handlerId].filter(
      (id): id is string => typeof id === 'string' && id !== '' && id !== viewerPersonId
    )
  );
  if (others.size === 0) return { kind: 'none' };
  const name = handlerName?.trim();
  if (handlerId && others.has(handlerId) && name) return { kind: 'named', name };
  return { kind: 'unnamed' };
}
