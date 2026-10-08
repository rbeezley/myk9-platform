/**
 * Owners and dogs created during one wizard session (MYK9-1058).
 *
 * The wizard writes people and dogs the moment their dialogs save, long before
 * the final step submits entries. A secretary who leaves in between keeps those
 * records but has no entry for them. This module is the pure half: the record
 * shape and the sentence that names who has no entry yet.
 */

import { getDogDisplayName, type Dog, type User } from '@/types/dog-types';

export interface CreatedOwner {
  id: string;
  name: string;
}

export interface CreatedDog {
  id: string;
  name: string;
  ownerId: string;
}

export interface CreatedInSession {
  owners: CreatedOwner[];
  dogs: CreatedDog[];
}

export const EMPTY_CREATED_IN_SESSION: CreatedInSession = { owners: [], dogs: [] };

export function toCreatedOwner(owner: User): CreatedOwner {
  const name = (owner.name || `${owner.firstName} ${owner.lastName}`).trim();
  return { id: owner.id, name: name || 'The new owner' };
}

export function toCreatedDog(dog: Dog): CreatedDog {
  return { id: dog.id, name: getDogDisplayName(dog), ownerId: dog.ownerId };
}

/** Append `record` unless its id is already listed (the same save can report twice). */
export function addById<T extends { id: string }>(list: T[], record: T): T[] {
  return list.some(item => item.id === record.id) ? list : [...list, record];
}

/**
 * Names to put in the prompt: every dog created here, plus each created owner
 * who has no created dog (an owner whose dog is listed is covered by the dog).
 */
export function namesWithoutEntry({ owners, dogs }: CreatedInSession): string[] {
  const ownersWithDog = new Set(dogs.map(dog => dog.ownerId));
  return [
    ...dogs.map(dog => dog.name),
    ...owners.filter(owner => !ownersWithDog.has(owner.id)).map(owner => owner.name),
  ];
}

/** "Cracker has no entry yet." / "Cracker and Maple have no entry yet." */
export function describeNoEntryYet(created: CreatedInSession): string {
  const names = namesWithoutEntry(created);
  if (names.length === 0) return '';
  const subject =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${subject} ${names.length === 1 ? 'has' : 'have'} no entry yet.`;
}
