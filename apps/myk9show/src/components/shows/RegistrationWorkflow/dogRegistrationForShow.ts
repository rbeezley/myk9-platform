/**
 * Which of a dog's registrations a given show will actually use (MYK9-569).
 *
 * A show never mixes sanctioning bodies (MYK9-490,
 * `docs/reference/heritage-registry-columns.md`): the show's registry decides
 * which registration rides on the entry, and `trg_entries_require_dog_registration`
 * rejects an entry whose dog holds no registration for it. The dog card listed
 * AKC / UKC / ASCA as equal-weight chips, which reads as a choice the exhibitor
 * does not have — and said nothing at all when the one that matters is missing.
 *
 * Pure module: no React, no I/O. The ordering rule (primary, then
 * earliest-created, then id) is NOT re-implemented here — it is borrowed from
 * `resolveDogIdentityForOrganization` so this surface can never disagree with
 * the entry blank, the AKC submission, or any other organization-scoped view.
 */

import type { Registration } from '@/types/dog-types';
import { normalizeOrganization, resolveDogIdentityForOrganization } from '@/features/dogs/identity';

/** The subset of a dog this resolver reads. Structural, so fixtures need nothing else. */
export interface DogRegistrationsLike {
  /** `undefined`/`null` means "not loaded on this data path", NOT "the dog has none". */
  registrations?: readonly Registration[] | null | undefined;
}

export interface RegistrationForShow {
  /** The registration this show will use, or null when the dog holds none for it. */
  used: Registration | null;
  /** Every other registration the dog carries. Shown, de-emphasized — never hidden. */
  others: readonly Registration[];
  /**
   * True only when we can prove the entry would be rejected: the show names a
   * registry AND the dog's registrations are loaded AND none of them is usable
   * for that registry. Fails OPEN when either fact is unknown — a data path
   * that has not loaded registrations must not block an exhibitor.
   */
  missingRegistration: boolean;
  /** The fix, in the exhibitor's words, when `missingRegistration`. Else null. */
  missingRegistrationMessage: string | null;
}

/**
 * Split a dog's registrations into the one this show uses and the rest.
 *
 * `showRegistryId` is the show's sanctioning body as resolved through
 * `@/features/registries` (`getTrialRegistry` / `deriveRegistryId`) — never a
 * raw column read. A null/blank value means the registry is not known yet.
 */
export function resolveRegistrationForShow(
  dog: DogRegistrationsLike | null | undefined,
  showRegistryId: string | null | undefined
): RegistrationForShow {
  const registrations = dog?.registrations;
  const all: readonly Registration[] = registrations ?? [];
  const registry = normalizeOrganization(showRegistryId);

  if (registry == null) {
    // No registry in context: mark nothing, de-emphasize nothing, block nobody.
    return {
      used: null,
      others: all,
      missingRegistration: false,
      missingRegistrationMessage: null,
    };
  }

  // The canonical organization-scoped pick. A registration with a blank number
  // is not usable — `getRegistrationPrerequisite` treats it the same way, and
  // the DB trigger is the reason both do.
  const identity = resolveDogIdentityForOrganization(all, registry);
  const used =
    identity.registrationNumber === null
      ? null
      : (all.find(
          registration =>
            normalizeOrganization(registration.organization) === registry &&
            registration.registrationNumber?.trim() === identity.registrationNumber
        ) ?? null);

  const others = all.filter(registration => registration !== used);
  const missingRegistration = used === null && registrations != null;

  return {
    used,
    others,
    missingRegistration,
    missingRegistrationMessage: missingRegistration
      ? `Add ${indefiniteArticle(registry)} ${registry} registration to enter this show`
      : null,
  };
}

/** "an AKC", "a UKC". Vowel-sound rule on the letter name, since these are initialisms. */
function indefiniteArticle(registry: string): 'a' | 'an' {
  return /^[AEFHILMNORSX]/.test(registry) ? 'an' : 'a';
}
