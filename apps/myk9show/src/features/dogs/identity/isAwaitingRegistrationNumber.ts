import { isOnClassRunList, type EntryAccountingFields } from '@/features/_shared/entryAccounting';
import {
  registrationMatchesOrganization,
  toDogRegistrationLike,
  type DogRegistrationLike,
  type MappedDogRegistrationLike,
} from './resolveDogIdentity';

/** The class and trial facts the conformation-puppy carve-out reads. */
export interface ConformationPuppyContext {
  trialType: string | null | undefined;
  className: string | null | undefined;
  element: string | null | undefined;
  level: string | null | undefined;
}

/**
 * AKC permits entering a conformation puppy before registration completes.
 * Missing metadata fails closed: the carve-out applies only when both the
 * sport and the class metadata prove it. Mirrors the SQL in
 * `entries_require_dog_registration()`.
 */
export function isConformationPuppyClass({
  trialType,
  className,
  element,
  level,
}: ConformationPuppyContext): boolean {
  const normalizedTrialType = trialType?.trim().toLowerCase() ?? '';
  if (!normalizedTrialType.includes('conformation')) return false;

  const classMetadata = [className, element, level]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();
  return classMetadata.includes('puppy');
}

/**
 * Is this entry awaiting a registration number (MYK9-1162)?
 *
 * Derived, never stored: true exactly when the entry is live, is not a
 * conformation puppy, and the dog holds no registration with a non-blank
 * number for the trial's registry. Adding the number ends the held state with
 * no further action. Mirrors the SQL rule in `entries_require_dog_registration()`
 * (blank registry means AKC, organization naming drift tolerated, a blank
 * number is not a number) and the filter in `emergency_packet_input`.
 *
 * `registrations` is `null`/`undefined` when the caller has not loaded the
 * dog's registrations. Unknown is NOT missing: it returns false, so an
 * unhydrated fixture can never silently empty a class. An empty array means
 * "loaded, and there are none" and is held.
 */
export function isAwaitingRegistrationNumber(
  entry: EntryAccountingFields,
  registryId: string | null | undefined,
  registrations: readonly (DogRegistrationLike | MappedDogRegistrationLike)[] | null | undefined,
  puppyContext?: ConformationPuppyContext
): boolean {
  if (registrations == null) return false;
  if (!isOnClassRunList(entry)) return false;
  if (puppyContext && isConformationPuppyClass(puppyContext)) return false;

  const registry = registryId?.trim() || 'AKC';
  return !registrations.some(registration => {
    const row = toDogRegistrationLike(registration);
    return (
      (row.registration_number?.trim() ?? '') !== '' &&
      registrationMatchesOrganization(row, registry)
    );
  });
}

/** The registration fields a dog-shaped value carries, in the replica's casing. */
export interface DogRegistrationsSource {
  registrations?: readonly (DogRegistrationLike | MappedDogRegistrationLike)[] | null | undefined;
  /** False when the read was incomplete: `[]` is then not authoritative. */
  registrationsReadComplete?: boolean | undefined;
}

/**
 * The dog's registrations when they are known, else `undefined`. A missing
 * dog, an unloaded list or an incomplete read are all "unknown", which
 * `isAwaitingRegistrationNumber` never reads as held.
 */
export function registrationsIfKnown(
  dog: DogRegistrationsSource | null | undefined
): readonly (DogRegistrationLike | MappedDogRegistrationLike)[] | undefined {
  if (!dog || dog.registrationsReadComplete === false) return undefined;
  return dog.registrations ?? undefined;
}

/** The part of a `loadDogRegistrations` result the held-entry rule reads. */
export interface RegistrationsRead {
  byDog: ReadonlyMap<string, readonly DogRegistrationLike[] | readonly Record<string, unknown>[]>;
  registrationsReadComplete: boolean;
  source?: 'server' | 'device' | undefined;
}

/**
 * A dog's registrations out of a `loadDogRegistrations` result, or `undefined`
 * when the read did not answer for that dog. A complete read answers for every
 * dog (no rows means none). An incomplete read answers only for dogs it
 * returned rows for, or wholesale from a non-empty device read: the secretary's
 * device copy is never reported complete, yet it is authoritative offline.
 */
export function registrationsFromRead(
  read: RegistrationsRead,
  dogId: string
): readonly DogRegistrationLike[] | undefined {
  const rows = read.byDog.get(dogId) as readonly DogRegistrationLike[] | undefined;
  const deviceAnswered = read.source === 'device' && read.byDog.size > 0;
  if (read.registrationsReadComplete || deviceAnswered || rows !== undefined) return rows ?? [];
  return undefined;
}
