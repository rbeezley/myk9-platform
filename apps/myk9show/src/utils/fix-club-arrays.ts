/**
 * Targeted fix for club arrays without full storage reset
 */

export const fixClubArrays = (): void => {
  try {
    // Get current club data from localStorage
    const clubStoreKey = 'club-store-v4';
    const clubData = localStorage.getItem(clubStoreKey);

    if (!clubData) {
      return;
    }

    const parsedData = JSON.parse(clubData);

    if (!parsedData.state || !parsedData.state.clubs) {
      return;
    }

    // Fix each club's arrays
    parsedData.state.clubs = parsedData.state.clubs.map((club: Record<string, unknown>) => ({
      ...club,
      upcomingShows: Array.isArray(club.upcomingShows) ? club.upcomingShows : [],
      pastShows: Array.isArray(club.pastShows) ? club.pastShows : []
    }));

    // Save back to localStorage
    localStorage.setItem(clubStoreKey, JSON.stringify(parsedData));
  } catch {
    // Fix failed silently
  }
};

// Make available in browser console
if (typeof window !== 'undefined') {
  (window as unknown as Window & { fixClubArrays: typeof fixClubArrays }).fixClubArrays = fixClubArrays;
}
