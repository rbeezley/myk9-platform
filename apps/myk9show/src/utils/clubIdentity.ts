import type { Club } from '@/types/club-types';

export interface ClubIdentityInput {
  name?: string | null | undefined;
  email?: string | null | undefined;
  website?: string | null | undefined;
  city?: string | null | undefined;
  state?: string | null | undefined;
}

export interface ClubIdentityCandidate {
  club: Club;
  score: number;
  reasons: string[];
}

export function normalizeClubName(value: string | null | undefined): string {
  return (value ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeEmail(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

export function normalizeWebsiteDomain(value: string | null | undefined): string {
  const trimmed = (value ?? '').trim().toLowerCase();
  if (!trimmed) return '';

  try {
    const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    return new URL(withProtocol).hostname.replace(/^www\./, '');
  } catch {
    return trimmed
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0]
      .trim();
  }
}

export function emailDomain(value: string | null | undefined): string {
  const normalized = normalizeEmail(value);
  const atIndex = normalized.lastIndexOf('@');
  if (atIndex < 0) return '';
  return normalized.slice(atIndex + 1);
}

function sameNormalizedText(left: string | null | undefined, right: string | null | undefined) {
  return normalizeClubName(left) !== '' && normalizeClubName(left) === normalizeClubName(right);
}

export function clubNamesMatch(left: string | null | undefined, right: string | null | undefined) {
  return normalizeClubName(left) !== '' && normalizeClubName(left) === normalizeClubName(right);
}

export function findLikelyDuplicateClubCandidate(
  clubs: Club[],
  input: ClubIdentityInput,
  options?: { excludeClubId?: string | undefined }
): ClubIdentityCandidate | null {
  const inputName = normalizeClubName(input.name);
  const inputWebsiteDomain = normalizeWebsiteDomain(input.website);
  const inputEmailDomain = emailDomain(input.email);

  const candidates = clubs
    .filter(club => !options?.excludeClubId || club.id !== options.excludeClubId)
    .map(club => {
      let score = 0;
      const reasons: string[] = [];

      if (inputName !== '' && inputName === normalizeClubName(club.name)) {
        score += 10;
        reasons.push('same club name');
      }

      const clubWebsiteDomain = normalizeWebsiteDomain(club.website);
      if (inputWebsiteDomain !== '' && inputWebsiteDomain === clubWebsiteDomain) {
        score += 7;
        reasons.push('same website');
      }

      const clubEmailDomain = emailDomain(club.email);
      if (inputEmailDomain !== '' && inputEmailDomain === clubEmailDomain) {
        score += 3;
        reasons.push('same email domain');
      }

      if (sameNormalizedText(club.address?.city, input.city)) {
        score += 2;
        reasons.push('same city');
      }

      if (sameNormalizedText(club.address?.state, input.state)) {
        score += 1;
        reasons.push('same state');
      }

      return { club, score, reasons };
    })
    .filter(candidate => candidate.score >= 7)
    .sort((left, right) => right.score - left.score);

  return candidates[0] ?? null;
}
