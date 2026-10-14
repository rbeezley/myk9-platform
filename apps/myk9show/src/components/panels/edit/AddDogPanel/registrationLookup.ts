import type { Dog } from '@/types/dog-types';
import {
  findDogByExactRegistrationIdentity,
  type DogRegistrationIdentity,
} from '@/utils/dogIdentity';

/** What "Find dog" learned about a registry identity (MYK9-1162). */
export type RegistrationLookupResult =
  /** A dog the user can see already holds it: offer to use that dog. */
  | { kind: 'existing'; dog: Dog }
  /** A dog the user cannot see holds it: say so, reveal nothing about it. */
  | { kind: 'taken' }
  /** Nothing known holds it, or nobody could say (offline, failed): carry on. */
  | { kind: 'free' };

/**
 * Look a registry identity up on the device first, with no owner filter (every
 * dog on the device is one this user may see), then ask the server only when the
 * device has no match. `askServer` resolves `null` when it cannot answer, which
 * reads as "free": the server's unique index on live registry identities is the
 * final guard at upload.
 */
export async function lookupRegistrationIdentity(
  dogs: Dog[],
  identity: DogRegistrationIdentity,
  askServer: (identity: DogRegistrationIdentity) => Promise<boolean | null>
): Promise<RegistrationLookupResult> {
  const dog = findDogByExactRegistrationIdentity(
    dogs.filter(candidate => !candidate.deletedAt),
    identity
  );
  if (dog) return { kind: 'existing', dog };
  return (await askServer(identity)) === true ? { kind: 'taken' } : { kind: 'free' };
}
