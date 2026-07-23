/**
 * Scopes an order-level `MyEntry` down to a single dog for callers that still
 * expect a "one dog" shape — dialogs (check-in/edit/receipt) and the
 * result-card builder key off `entry.dogName`/`entry.dogId`/`entry.classes`.
 * Order-level fields (show, payment, confirmation) pass through unchanged.
 *
 * @module MyEntriesPage/modules/myEntryDogView
 */

import type { MyEntry, MyEntryDogGroup } from './my-entries-types';

export function toDogEntryView(entry: MyEntry, dog: MyEntryDogGroup): MyEntry {
  return {
    ...entry,
    dogId: dog.dogId,
    dogName: dog.dogName,
    armband: dog.armband,
    classes: dog.classes,
    entryStatus: dog.entryStatus,
  };
}

/** Finds the dog on the order that owns the given class row id. */
export function findOwningDog(entry: MyEntry, classId: string): MyEntryDogGroup | undefined {
  return entry.dogs.find(dog => dog.classes.some(cls => cls.id === classId));
}
