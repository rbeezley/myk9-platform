/**
 * Targeted fix for club arrays without full storage reset
 */

export const fixClubArrays = (): void => {
  try {
    // Get current club data from localStorage
    const clubStoreKey = 'club-store-v4';
    const clubData = localStorage.getItem(clubStoreKey);
    
    if (!clubData) {
      console.log('❌ No club data found');
      return;
    }
    
    const parsedData = JSON.parse(clubData);
    
    if (!parsedData.state || !parsedData.state.clubs) {
      console.log('❌ Invalid club data structure');
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
    
    console.log('✅ Fixed club arrays for', parsedData.state.clubs.length, 'clubs');
    console.log('🔄 Please refresh the page to see changes');
  } catch (error) {
    console.error('❌ Failed to fix club arrays:', error);
  }
};

// Make available in browser console
if (typeof window !== 'undefined') {
  (window as unknown as Window & { fixClubArrays: typeof fixClubArrays }).fixClubArrays = fixClubArrays;
}