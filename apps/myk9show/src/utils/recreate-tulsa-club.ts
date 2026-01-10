/**
 * Utility to recreate the Tulsa Dog Training Club for development
 * This helps recover from cache clearing issues
 */
import { useClubStore } from '@/store/clubStore';
import type { Club } from '@/types/club-types';

export const recreateTulsaClub = async (): Promise<void> => {
  const clubStore = useClubStore.getState();
  
  // Check if Tulsa club already exists
  const existingClub = clubStore.clubs.find(club => 
    club.name.toLowerCase().includes('tulsa') || 
    club.id === 'club-tulsa-dog-training'
  );
  
  if (existingClub) {
    return;
  }
  
  const tulsaClub: Club = {
    id: 'club-tulsa-dog-training',
    name: 'Tulsa Dog Training Club',
    clubNumber: 'TDTC-2024',
    email: 'info@tulsadogtraining.com',
    phone: '(918) 555-0123',
    website: 'https://tulsadogtraining.com',
    description: 'A premier dog training club in Tulsa, Oklahoma, offering comprehensive training programs for dogs of all ages and skill levels.',
    logo: 'https://cdn-icons-png.flaticon.com/512/1076/1076834.png',
    address: {
      street: '1234 Training Way',
      city: 'Tulsa',
      state: 'OK',
      zipCode: '74101',
      country: 'US'
    },
    founded: new Date('2020-01-15'),
    clubType: 'local',
    memberIds: [],
    upcomingShows: [],
    pastShows: [],
    _version: 1,
    _lastModified: new Date(),
    _lastModifiedBy: 'dev-recovery',
    _syncStatus: 'synced',
    _localOnly: false
  };
  
  // Add the club to the store
  clubStore.addClub(tulsaClub);
};

// Make available in browser console for development
if (typeof window !== 'undefined') {
  (window as unknown as Window & { recreateTulsaClub: typeof recreateTulsaClub }).recreateTulsaClub = recreateTulsaClub;
}