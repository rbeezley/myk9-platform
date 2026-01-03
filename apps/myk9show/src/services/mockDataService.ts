/**
 * Mock Data Service - Centralized data initialization and management
 * 
 * This service coordinates data initialization between Zustand stores 
 * and React Query hooks to ensure consistent mock data across the application.
 */

import { masterMockData, getPerson, getPersonDogs, getClubMembers, getClubAdmin } from '@/mockData/masterData';
import { useUserStore } from '@/store/userStore';
import { useClubStore } from '@/store/clubStore';
import { useDogStore } from '@/store/dogStore';

// Data initialization flags to prevent duplicate initialization
let isInitialized = false;

/**
 * Initialize all Zustand stores with master mock data
 * Called once per application session
 */
export const initializeMockData = () => {
  if (isInitialized) {
    console.log('Mock data already initialized, skipping...');
    return;
  }

  console.log('Initializing mock data from master source...');

  // Initialize Users Store
  const userStore = useUserStore.getState();
  if (userStore.people.length === 0) {
    userStore.setPeople(masterMockData.people);
    console.log(`✓ Users store initialized with ${masterMockData.people.length} people`);
  }

  // Initialize Clubs Store  
  const clubStore = useClubStore.getState();
  if (clubStore.clubs.length === 0) {
    clubStore.setClubs(masterMockData.clubs);
    // Set first club as selected if none selected
    if (!clubStore.selectedClubId && masterMockData.clubs.length > 0) {
      clubStore.selectClub(masterMockData.clubs[0].id);
    }
    console.log(`✓ Club store initialized with ${masterMockData.clubs.length} clubs`);
  }

  // Initialize Dogs Store
  const dogStore = useDogStore.getState();
  if (dogStore.dogs.length === 0) {
    dogStore.setDogs(masterMockData.dogs);
    console.log(`✓ Dog store initialized with ${masterMockData.dogs.length} dogs`);
  }

  isInitialized = true;
  console.log('✓ Mock data initialization complete');
};

/**
 * Reset all stores and clear localStorage
 * Useful for testing and development
 */
export const resetMockData = () => {
  console.log('Resetting all mock data...');
  
  // Clear stores
  useUserStore.getState().setPeople([]);
  useClubStore.getState().setClubs([]);
  useDogStore.getState().setDogs([]);
  
  // Clear localStorage for all stores
  localStorage.removeItem('club-store');
  localStorage.removeItem('people-store');
  localStorage.removeItem('dog-store');
  
  // Reset initialization flag
  isInitialized = false;
  
  console.log('✓ Mock data reset complete - stores are now empty');
};

/**
 * Force clear all storage - for testing empty state
 */
export const clearAllStorage = () => {
  // Clear Zustand store keys
  localStorage.removeItem('club-store');
  localStorage.removeItem('people-store');
  localStorage.removeItem('dog-store');
  
  // Clear any other storage keys that might exist
  Object.keys(localStorage).forEach(key => {
    if (key.includes('store') || key.includes('club') || key.includes('people') || key.includes('dog')) {
      localStorage.removeItem(key);
      console.log('Removed storage key:', key);
    }
  });
  
  console.log('✓ All storage cleared');
};

/**
 * Get initialization status
 */
export const getMockDataStatus = () => {
  return {
    isInitialized,
    peopleCount: useUserStore.getState().people.length,
    clubCount: useClubStore.getState().clubs.length,
    dogCount: useDogStore.getState().dogs.length,
  };
};

/**
 * Validate data integrity across stores
 * Ensures all references are valid
 */
export const validateMockDataIntegrity = () => {
  const issues: string[] = [];
  
  // Check dog owner references
  masterMockData.dogs.forEach(dog => {
    const owner = getPerson(dog.ownerId);
    if (!owner) {
      issues.push(`Dog ${dog.name} (${dog.id}) references non-existent owner: ${dog.ownerId}`);
    }
  });
  
  // Check club admin references - Note: club admin is now managed via RBAC
  masterMockData.clubs.forEach(club => {
    // No longer checking clubAdminId as it's been removed in favor of RBAC
    
    // Check club member references
    if (club.memberIds) {
      club.memberIds.forEach(memberId => {
        const member = getPerson(memberId);
        if (!member) {
          issues.push(`Club ${club.name} (${club.id}) references non-existent member: ${memberId}`);
        }
      });
    }
  });
  
  // Check show references
  masterMockData.shows.forEach(show => {
    // Check club references
    const club = masterMockData.clubs.find(c => c.id === show.clubId);
    if (!club) {
      issues.push(`Show ${show.name} (${show.id}) references non-existent club: ${show.clubId}`);
    }
    
    // Check judge references in assignedJudges
    if (show.assignedJudges) {
      show.assignedJudges.forEach(assignment => {
        const judge = getPerson(assignment.judgeId);
        if (!judge) {
          issues.push(`Show ${show.name} (${show.id}) references non-existent judge: ${assignment.judgeId}`);
        }
      });
    }
  });
  
  return {
    isValid: issues.length === 0,
    issues,
    summary: issues.length === 0 ? 'All data references are valid' : `Found ${issues.length} data integrity issues`
  };
};

/**
 * Get comprehensive data summary for debugging
 */
export const getMockDataSummary = () => {
  const integrity = validateMockDataIntegrity();
  const status = getMockDataStatus();
  
  return {
    status,
    integrity,
    entities: {
      people: masterMockData.people.map(p => ({ id: p.id, name: `${p.firstName} ${p.lastName}`, dogCount: p.dogs?.length || 0 })),
      clubs: masterMockData.clubs.map(c => ({ 
        id: c.id, 
        name: c.name, 
        adminId: null, // Admin management now handled via RBAC
        adminName: 'Managed via RBAC',
        memberCount: c.memberIds?.length || 0 
      })),
      dogs: masterMockData.dogs.map(d => ({ 
        id: d.id, 
        name: d.name, 
        ownerId: d.ownerId,
        ownerName: getPerson(d.ownerId)?.firstName + ' ' + getPerson(d.ownerId)?.lastName || 'Unknown Owner'
      })),
      shows: masterMockData.shows.map(s => ({ 
        id: s.id, 
        name: s.name, 
        clubId: s.clubId,
        judgeCount: s.assignedJudges?.length || 0
      }))
    }
  };
};

/**
 * Helper function to check if stores need initialization
 * Can be called from components to trigger initialization
 * 
 * Set ENABLE_AUTO_INIT to false for testing with empty stores
 */
const ENABLE_AUTO_INIT = false; // Change to true when you want mock data

export const checkAndInitialize = () => {
  if (!ENABLE_AUTO_INIT) {
    console.log('Auto-initialization disabled - starting with empty stores for testing');
    return true;
  }
  
  const userStore = useUserStore.getState();
  const clubStore = useClubStore.getState();
  const dogStore = useDogStore.getState();
  
  const needsInit = 
    userStore.people.length === 0 || 
    clubStore.clubs.length === 0 || 
    dogStore.dogs.length === 0;
    
  if (needsInit && !isInitialized) {
    initializeMockData();
  }
  
  return !needsInit;
};

// Export master data and helper functions for direct access
export {
  masterMockData,
  getPerson,
  getPersonDogs,
  getClubMembers,
  getClubAdmin
};