import { describe, expect, it } from 'vitest';
import type { Club } from '@/types/club-types';
import { UserRole } from '@/types/auth-types';
import { filterVisibleBrowseClubs, isDeveloperSeedClub } from '../browseClubsVisibility';

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

  // MYK9-747: the clubs replica is device-wide and a guest sync never prunes
  // it (a signed-out prune would delete a secretary's own unauthorized club).
  // The guest directory must still show only what clubs_select grants anon.
  describe('signed-out viewer (MYK9-747)', () => {
    function withAuthorization(name: string, authorizedAt: string | null): Club {
      return { ...makeClub(name), authorizedAt };
    }

    it('shows only the clubs the server lists for a guest, even when a cached row still reads authorized', () => {
      // A revoked club drops out of anon's clubs_select, so the guest's
      // incremental sync never downloads its authorized_at = null: the cached
      // row keeps its stale timestamp. Only the server's id set can drop it.
      const clubs = [
        withAuthorization('Listed Club', '2026-01-01T00:00:00Z'),
        withAuthorization('Revoked Club', '2026-01-01T00:00:00Z'),
      ];

      const visible = filterVisibleBrowseClubs(clubs, [], {
        isGuest: true,
        guestVisibleClubIds: new Set(['Listed Club']),
      });

      expect(visible.map(club => club.name)).toEqual(['Listed Club']);
    });

    it('keeps a server-listed club that hosts a public show even when it is not authorized', () => {
      const clubs = [withAuthorization('Revoked Host Club', null)];

      const visible = filterVisibleBrowseClubs(clubs, [], {
        isGuest: true,
        guestVisibleClubIds: new Set(['Revoked Host Club']),
      });

      expect(visible.map(club => club.name)).toEqual(['Revoked Host Club']);
    });

    it('falls back to authorization when no guest id set is known (offline)', () => {
      const clubs = [
        withAuthorization('Authorized Club', '2026-01-01T00:00:00Z'),
        // A secretary's own never-authorized club, cached by their signed-in session.
        withAuthorization('Unauthorized Club', null),
      ];

      const visible = filterVisibleBrowseClubs(clubs, [], {
        isGuest: true,
        guestVisibleClubIds: null,
      });

      expect(visible.map(club => club.name)).toEqual(['Authorized Club']);
    });

    it("leaves a signed-in viewer's directory to the server-reconciled replica", () => {
      const clubs = [withAuthorization('My Unauthorized Club', null)];

      const visible = filterVisibleBrowseClubs(clubs, [UserRole.SECRETARY], {
        isGuest: false,
        guestVisibleClubIds: new Set(),
      });

      expect(visible.map(club => club.name)).toEqual(['My Unauthorized Club']);
    });
  });
});
