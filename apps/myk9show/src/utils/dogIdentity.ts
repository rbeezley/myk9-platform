import type { Dog, Registration } from '@/types/dog-types';

export interface DogRegistrationIdentity {
  organization: string;
  registrationNumber: string;
}

export interface DogIdentityCandidateInput {
  ownerId?: string | undefined;
  callName?: string | undefined;
  registeredName?: string | undefined;
  breed?: string | undefined;
  sex?: Dog['sex'] | undefined;
  dateOfBirth?: string | undefined;
  microchipNumber?: string | undefined;
  registrations?: DogRegistrationIdentity[] | undefined;
}

export interface DogIdentityCandidate {
  dog: Dog;
  score: number;
  reasons: string[];
}

export function normalizeDogRegistrationOrganization(value: string | null | undefined): string {
  const normalized = (value ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
  if (normalized.startsWith('AKC')) return 'AKC';
  if (normalized.startsWith('UKC')) return 'UKC';
  if (normalized.startsWith('CKC')) return 'CKC';
  if (normalized.startsWith('FCI')) return 'FCI';
  if (normalized.startsWith('ASCA')) return 'ASCA';
  if (normalized.startsWith('KC')) return 'KC';
  return normalized;
}

export function normalizeDogRegistrationNumber(value: string | null | undefined): string {
  return (value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function normalizeDogRegistrationIdentity(
  identity: DogRegistrationIdentity
): DogRegistrationIdentity {
  return {
    organization: normalizeDogRegistrationOrganization(identity.organization),
    registrationNumber: normalizeDogRegistrationNumber(identity.registrationNumber),
  };
}

export function registrationIdentitiesMatch(
  left: DogRegistrationIdentity,
  right: DogRegistrationIdentity
): boolean {
  const normalizedLeft = normalizeDogRegistrationIdentity(left);
  const normalizedRight = normalizeDogRegistrationIdentity(right);
  return (
    normalizedLeft.organization !== '' &&
    normalizedLeft.registrationNumber !== '' &&
    normalizedLeft.organization === normalizedRight.organization &&
    normalizedLeft.registrationNumber === normalizedRight.registrationNumber
  );
}

export function getRegistrationIdentity(registration: Registration): DogRegistrationIdentity {
  return {
    organization: registration.organization,
    registrationNumber: registration.registrationNumber,
  };
}

export function findDogByExactRegistrationIdentity(
  dogs: Dog[],
  identity: DogRegistrationIdentity,
  options?: { excludeDogId?: string | undefined }
): Dog | null {
  return (
    dogs.find(dog => {
      if (options?.excludeDogId && dog.id === options.excludeDogId) return false;
      return (dog.registrations ?? []).some(registration =>
        registrationIdentitiesMatch(getRegistrationIdentity(registration), identity)
      );
    }) ?? null
  );
}

function normalizeComparableText(value: string | null | undefined): string {
  return (value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sameText(left: string | null | undefined, right: string | null | undefined): boolean {
  const normalizedLeft = normalizeComparableText(left);
  const normalizedRight = normalizeComparableText(right);
  return normalizedLeft !== '' && normalizedLeft === normalizedRight;
}

function registrationRegisteredNames(dog: Dog): string[] {
  return (dog.registrations ?? [])
    .map(registration => registration.registeredName)
    .filter((name): name is string => Boolean(name));
}

export function findLikelyDuplicateDogCandidate(
  dogs: Dog[],
  input: DogIdentityCandidateInput,
  options?: { excludeDogId?: string | undefined }
): DogIdentityCandidate | null {
  const candidates = dogs
    .filter(dog => !options?.excludeDogId || dog.id !== options.excludeDogId)
    .filter(dog => !dog.deletedAt)
    .filter(dog => !input.ownerId || dog.ownerId === input.ownerId)
    .map(dog => {
      let score = 0;
      const reasons: string[] = [];

      const inputChip = normalizeDogRegistrationNumber(input.microchipNumber);
      const dogChip = normalizeDogRegistrationNumber(dog.microchipNumber ?? dog.microchip);
      if (inputChip !== '' && inputChip === dogChip) {
        score += 8;
        reasons.push('same microchip');
      }

      if (sameText(dog.callName, input.callName)) {
        score += 2;
        reasons.push('same call name');
      }

      // MYK9-90 §5.2 — `dog.name` is no longer consulted for the registered
      // name. It is a legacy alias that now falls back to the call name, so
      // matching it against a registered name would score a call-name collision
      // as a registered-name collision. Registered names live on the
      // registrations.
      if (registrationRegisteredNames(dog).some(name => sameText(name, input.registeredName))) {
        score += 4;
        reasons.push('same registered name');
      }

      if (sameText(dog.breed, input.breed)) {
        score += 1;
        reasons.push('same breed');
      }

      if (input.sex && dog.sex === input.sex) {
        score += 1;
        reasons.push('same sex');
      }

      if (
        input.dateOfBirth &&
        (dog.dateOfBirth === input.dateOfBirth || dog.birthDate === input.dateOfBirth)
      ) {
        score += 2;
        reasons.push('same date of birth');
      }

      if (
        input.registrations?.some(
          identity => findDogByExactRegistrationIdentity([dog], identity, options) !== null
        )
      ) {
        score += 10;
        reasons.push('same registration number');
      }

      return { dog, score, reasons };
    })
    .filter(candidate => candidate.score >= 7)
    .sort((left, right) => right.score - left.score);

  return candidates[0] ?? null;
}
