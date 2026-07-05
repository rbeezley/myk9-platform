import { describe, expect, it } from 'vitest';
import type { Club } from '@/types/club-types';
import { UserRole } from '@/types/auth-types';
import {
  filterVisibleBrowseClubs,
  isDeveloperSeedClub,
} from '../browseClubsVisibility';

function makeClub(name: string): Club {
  return {
    id: name,
    name,
    clubNumber: '',
    email: '',
    phone: '',
    website: '',
    description: '',
    address: { street: '', city: '', state: '', zipCode: '', country: 'US' },
    logo: '',
    coverImage: '',
    accentColor: '',
    upcomingShows: [],
    pastShows: [],
  };
}

describe('browse clubs visibility', () => {
  it('identifies E2E seed clubs by their visible seed prefix', () => {
    expect(isDeveloperSeedClub(makeClub('E2E Club 174'))).toBe(true);
    expect(isDeveloperSeedClub(makeClub('Golden State Dog Club'))).toBe(false);
  });

  it('hides developer seed clubs for non-admin browse users', () => {
    const clubs = [makeClub('Golden State Dog Club'), makeClub('E2E Club 174')];

    expect(filterVisibleBrowseClubs(clubs, [UserRole.EXHIBITOR]).map(club => club.name)).toEqual([
      'Golden State Dog Club',
    ]);
  });

  it('keeps developer seed clubs visible to site admins', () => {
    const clubs = [makeClub('Golden State Dog Club'), makeClub('E2E Club 174')];

    expect(filterVisibleBrowseClubs(clubs, [UserRole.SITE_ADMIN]).map(club => club.name)).toEqual([
      'Golden State Dog Club',
      'E2E Club 174',
    ]);
  });
});
