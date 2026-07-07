import type { User } from '@/types/user-types';

export interface PersonIdentityInput {
  firstName?: string | null | undefined;
  lastName?: string | null | undefined;
  email?: string | null | undefined;
  phone?: string | null | undefined;
  streetAddress?: string | null | undefined;
  city?: string | null | undefined;
  state?: string | null | undefined;
  zipCode?: string | null | undefined;
}

export interface PersonIdentityCandidate {
  person: User;
  score: number;
  reasons: string[];
}

export function normalizePersonEmail(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

export function normalizePersonName(value: string | null | undefined): string {
  return (value ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizePhone(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '');
}

function normalizeAddressText(value: string | null | undefined): string {
  return normalizePersonName(value);
}

function inputFullName(input: PersonIdentityInput): string {
  return normalizePersonName([input.firstName, input.lastName].filter(Boolean).join(' '));
}

function personFullName(person: User): string {
  return normalizePersonName(
    person.name || [person.firstName, person.lastName].filter(Boolean).join(' ')
  );
}

export function personEmailsMatch(
  left: string | null | undefined,
  right: string | null | undefined
): boolean {
  return (
    normalizePersonEmail(left) !== '' && normalizePersonEmail(left) === normalizePersonEmail(right)
  );
}

export function findLikelyDuplicatePersonCandidate(
  people: User[],
  input: PersonIdentityInput,
  options?: { excludePersonId?: string | undefined }
): PersonIdentityCandidate | null {
  const email = normalizePersonEmail(input.email);
  const fullName = inputFullName(input);
  const phone = normalizePhone(input.phone);
  const streetAddress = normalizeAddressText(input.streetAddress);
  const city = normalizeAddressText(input.city);
  const state = normalizeAddressText(input.state);
  const zipCode = normalizeAddressText(input.zipCode);

  const candidates = people
    .filter(person => !options?.excludePersonId || person.id !== options.excludePersonId)
    .filter(person => !person.deletedAt)
    .map(person => {
      let score = 0;
      const reasons: string[] = [];

      if (email !== '' && email === normalizePersonEmail(person.email)) {
        score += 10;
        reasons.push('same email');
      }

      if (fullName !== '' && fullName === personFullName(person)) {
        score += 4;
        reasons.push('same name');
      }

      if (phone !== '' && phone === normalizePhone(person.phone)) {
        score += 5;
        reasons.push('same phone');
      }

      const personStreet = normalizeAddressText(person.streetAddress ?? person.address);
      if (streetAddress !== '' && streetAddress === personStreet) {
        score += 3;
        reasons.push('same address');
      }

      if (city !== '' && city === normalizeAddressText(person.city)) {
        score += 1;
        reasons.push('same city');
      }

      if (state !== '' && state === normalizeAddressText(person.state)) {
        score += 1;
        reasons.push('same state');
      }

      if (zipCode !== '' && zipCode === normalizeAddressText(person.zipCode)) {
        score += 1;
        reasons.push('same ZIP');
      }

      return { person, score, reasons };
    })
    .filter(candidate => candidate.score >= 7)
    .sort((left, right) => right.score - left.score);

  return candidates[0] ?? null;
}
