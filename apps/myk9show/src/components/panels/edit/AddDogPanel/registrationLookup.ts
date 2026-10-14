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
 * device has no match, and re-read the device before calling a match foreign. `askServer` resolves `null` when it cannot answer, which
 * reads as "free": the server's unique index on live registry identities is the
 * final guard at upload.
 */
export async function lookupRegistrationIdentity(
  getDogs: () => Dog[],
  identity: DogRegistrationIdentity,
  askServer: (identity: DogRegistrationIdentity) => Promise<boolean | null>
): Promise<RegistrationLookupResult> {
  const visible = () =>
    findDogByExactRegistrationIdentity(
      getDogs().filter(candidate => !candidate.deletedAt),
      identity
    );
  const dog = visible();
  if (dog) return { kind: 'existing', dog };
  if ((await askServer(identity)) !== true) return { kind: 'free' };
  // The roster may have finished loading while the server answered: a dog the user can now
  // see is theirs to use, never "someone else's".
  const loaded = visible();
  return loaded ? { kind: 'existing', dog: loaded } : { kind: 'taken' };
}
