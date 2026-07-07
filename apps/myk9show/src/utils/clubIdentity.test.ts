import { describe, expect, it } from 'vitest';
import type { Club } from '@/types/club-types';
import {
  clubNamesMatch,
  emailDomain,
  findLikelyDuplicateClubCandidate,
  normalizeClubName,
  normalizeWebsiteDomain,
} from './clubIdentity';

const club = (overrides: Partial<Club> = {}): Club => ({
  id: 'club-1',
  name: 'Heartland Scent Work Club',
  clubNumber: 'CLUB-1',
  email: 'secretary@heartlandscentwork.org',
  phone: '555-0100',
  website: 'https://www.heartlandscentwork.org/about',
  description: '',
  logo: '',
  coverImage: '',
  accentColor: '',
  address: {
    street: '1 Show Way',
    city: 'Des Moines',
    state: 'IA',
    zipCode: '50309',
    country: 'US',
  },
  upcomingShows: [],
  pastShows: [],
  ...overrides,
});

describe('club identity normalization', () => {
  it('normalizes club names by case, punctuation, and spacing', () => {
    expect(normalizeClubName(' heartland  scent-work club ')).toBe('HEARTLAND SCENT WORK CLUB');
    expect(clubNamesMatch('Heartland Scent Work Club', 'heartland scent-work club')).toBe(true);
  });

  it('normalizes website and email domains', () => {
    expect(normalizeWebsiteDomain('www.HeartlandScentWork.org/about')).toBe(
      'heartlandscentwork.org'
    );
    expect(emailDomain('Secretary@HeartlandScentWork.org')).toBe('heartlandscentwork.org');
  });
});

describe('club identity candidates', () => {
  it('suggests an exact normalized-name match', () => {
    const candidate = findLikelyDuplicateClubCandidate([club()], {
      name: 'heartland scent-work club',
    });

    expect(candidate?.club.id).toBe('club-1');
    expect(candidate?.reasons).toContain('same club name');
  });

  it('suggests a strong website-domain match', () => {
    const candidate = findLikelyDuplicateClubCandidate([club()], {
      name: 'Heartland K9 Sports',
      website: 'heartlandscentwork.org',
    });

    expect(candidate?.club.id).toBe('club-1');
    expect(candidate?.reasons).toContain('same website');
  });

  it('does not suggest weak location-only matches', () => {
    expect(
      findLikelyDuplicateClubCandidate([club()], {
        name: 'Different Club',
        city: 'Des Moines',
        state: 'IA',
      })
    ).toBeNull();
  });
});
